import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import XLSX from 'xlsx';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { checkSyntax, validateEmail, validateMany } from '../services/validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(requireAuth);

// --- helpers ---------------------------------------------------------------

// Normaliza: recorta espacios y pasa SIEMPRE a minúscula (los correos no
// distinguen mayúsculas en el dominio y en la práctica tampoco en el buzón).
function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}

// De una fila (arreglo de celdas, venga de Excel/CSV o de una línea pegada)
// saca { email, name }. Detecta la celda que es correo aunque las columnas
// vengan en cualquier orden, y soporta el formato "Nombre <correo@dominio>".
// Si la fila no tiene correo (p.ej. la fila de encabezados), devuelve null.
// Busca un correo DENTRO de cada celda (no exige que la celda sea solo el correo).
// Así tolera "Nombre <correo>", "nombre;correo", "nombre,correo" y celdas pegadas
// si el separador del CSV no se detectó bien (coma o punto y coma).
const EMAIL_IN_CELL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/;

function rowToContact(cells) {
  let email = null;
  let name = null;
  for (let raw of cells) {
    let cell = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '');
    if (!cell) continue;
    const m = cell.match(EMAIL_IN_CELL);
    if (m) {
      if (!email) email = m[0];
      const rest = cell.replace(m[0], '').replace(/[<>]/g, '').replace(/[;,]/g, ' ').trim();
      if (rest && !name) name = rest;
      continue;
    }
    if (!name) name = cell;
  }
  if (!email) return null;
  return { email: normalizeEmail(email), name: name || null };
}

// Texto pegado -> contactos. Una línea por contacto; dentro de la línea acepta
// separación por coma, punto y coma, tabulador (así funciona copiar/pegar desde Excel).
function parseTextToContacts(text) {
  const out = [];
  for (const line of String(text || '').split(/[\r\n]+/)) {
    if (!line.trim()) continue;
    const cells = line.split(/[,;\t]/);
    const c = rowToContact(cells);
    if (c) out.push(c);
  }
  return out;
}

const EMAIL_FULL = /^[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+$/;

// Con encabezados: la columna de correo va a email, name/nombre a name, y TODAS las
// demás columnas se guardan como campos personalizados (atributos) con la clave del encabezado.
function rowToContactWithHeaders(cells, headers) {
  let emailIdx = -1, email = null;
  for (let i = 0; i < cells.length; i++) {
    const v = String(cells[i] == null ? '' : cells[i]).trim().replace(/^["']|["']$/g, '');
    if (EMAIL_FULL.test(v)) { email = v.toLowerCase(); emailIdx = i; break; }
  }
  if (!email) return null;
  let name = null;
  const attrs = {};
  for (let i = 0; i < cells.length; i++) {
    if (i === emailIdx) continue;
    const hl = String(headers[i] || ('campo' + (i + 1))).toLowerCase().trim();
    const v = String(cells[i] == null ? '' : cells[i]).trim();
    if (!v) continue;
    if (name === null && (hl === 'name' || hl === 'nombre' || hl.includes('nombre') || hl.includes('name'))) { name = v; continue; }
    const key = hl.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (key && key !== 'email' && key !== 'correo') attrs[key] = v;
  }
  return { email, name, attributes: Object.keys(attrs).length ? attrs : null };
}

// Archivo (.csv, .xls, .xlsx) -> contactos. SheetJS autodetecta el formato.
function parseFileToContacts(filePath) {
  const wb = XLSX.readFile(filePath, { raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return [];
  // Si la primera fila NO contiene ningún correo, es la fila de encabezados.
  const firstHasEmail = (rows[0] || []).some(c => EMAIL_FULL.test(String(c).trim()));
  let headers = null, dataRows = rows;
  if (!firstHasEmail) { headers = (rows[0] || []).map(h => String(h)); dataRows = rows.slice(1); }
  const out = [];
  for (const row of dataRows) {
    const arr = Array.isArray(row) ? row : [row];
    const c = headers ? rowToContactWithHeaders(arr, headers) : rowToContact(arr);
    if (c) out.push(c);
  }
  return out;
}

// Inserta los contactos en la lista (deduplicando y descartando formato malo) y
// los valida (sintaxis + MX) para excluir luego los inválidos del envío.
async function ingestContacts(listId, parsed) {
  const seen = new Set();
  const candidates = [];
  let badFormat = 0;
  for (const it of parsed) {
    const email = normalizeEmail(it.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!checkSyntax(email)) { badFormat++; continue; }
    candidates.push({ email, name: it.name || null, attributes: it.attributes ? JSON.stringify(it.attributes) : null });
  }

  const fields = new Set();
  for (const c of candidates) { if (c.attributes) { try { Object.keys(JSON.parse(c.attributes)).forEach(k => fields.add(k)); } catch (e) {} } }

  const insert = db.prepare('INSERT OR IGNORE INTO contacts (list_id, email, name, unsubscribe_token, attributes) VALUES (?,?,?,?,?)');
  let imported = 0;
  db.transaction(items => {
    for (const r of items) {
      const info = insert.run(listId, r.email, r.name, randomBytes(32).toString('hex'), r.attributes);
      imported += info.changes;
      // Si ya existía y trae atributos nuevos, los actualizamos.
      if (!info.changes && r.attributes) db.prepare('UPDATE contacts SET attributes=? WHERE list_id=? AND email=?').run(r.attributes, listId, r.email);
    }
  })(candidates);

  // Validación de dominio (MX) — refresca también los que ya existían.
  const results = await validateMany(candidates.map(c => c.email));
  const upd = db.prepare("UPDATE contacts SET validation=?, validation_reason=?, validated_at=datetime('now') WHERE list_id=? AND email=?");
  let valid = 0, risky = 0, invalidDomain = 0;
  db.transaction(() => {
    candidates.forEach((c, i) => {
      const r = results[i] || { result: 'risky', reason: 'no verificado' };
      upd.run(r.result, r.reason, listId, c.email);
      if (r.result === 'valid') valid++;
      else if (r.result === 'risky') risky++;
      else invalidDomain++;
    });
  })();

  return {
    received: parsed.length,
    imported,
    duplicates: candidates.length - imported,
    bad_format: badFormat,
    valid,
    risky,
    invalid_domain: invalidDomain,
    fields: [...fields]
  };
}

function summaryMessage(s) {
  const parts = [`${s.imported} importados`];
  if (s.duplicates) parts.push(`${s.duplicates} duplicados omitidos`);
  if (s.bad_format) parts.push(`${s.bad_format} con formato inválido descartados`);
  if (s.invalid_domain) parts.push(`${s.invalid_domain} con dominio inexistente (no se enviarán)`);
  if (s.risky) parts.push(`${s.risky} riesgosos (revisar)`);
  return parts.join(', ');
}

function getOwnedList(req) {
  return db.prepare('SELECT id FROM contact_lists WHERE id = ? AND distributor_id = ?')
    .get(req.params.id, req.user.distributor_id);
}

// --- rutas -----------------------------------------------------------------

router.get('/', (req, res) => {
  const lists = db.prepare(`
    SELECT cl.*,
      COUNT(CASE WHEN c.status = 'active' THEN 1 END) as total_contacts,
      COUNT(CASE WHEN c.status = 'active' AND c.validation = 'invalid' THEN 1 END) as invalid_count,
      COUNT(CASE WHEN c.status = 'active' AND c.validation = 'risky' THEN 1 END) as risky_count,
      COUNT(CASE WHEN c.status = 'active' AND c.validation IS NULL THEN 1 END) as unvalidated_count
    FROM contact_lists cl
    LEFT JOIN contacts c ON c.list_id = cl.id
    WHERE cl.distributor_id = ?
    GROUP BY cl.id
    ORDER BY cl.created_at DESC
  `).all(req.user.distributor_id);
  res.json(lists);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const result = db.prepare('INSERT INTO contact_lists (distributor_id, name) VALUES (?,?)').run(req.user.distributor_id, name.trim());
  res.json({ id: result.lastInsertRowid, name: name.trim() });
});

// Renombrar la lista.
router.patch('/:id', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  db.prepare('UPDATE contact_lists SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true, name });
});

// Interruptor: incluir o no los correos 'risky' en el envío de esta lista.
router.patch('/:id/send-risky', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const value = req.body?.value ? 1 : 0;
  db.prepare('UPDATE contact_lists SET send_risky = ? WHERE id = ?').run(value, req.params.id);
  res.json({ ok: true, send_risky: value });
});

router.delete('/:id', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  // Desvincula campañas (conserva su historial) para no violar la llave foránea,
  // luego borra contactos y la lista. Todo en una transacción.
  db.transaction(() => {
    db.prepare('UPDATE campaigns SET list_id = NULL WHERE list_id = ?').run(req.params.id);
    db.prepare('DELETE FROM contacts WHERE list_id = ?').run(req.params.id);
    db.prepare('DELETE FROM contact_lists WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

// Lista de contactos para administrar. Filtro opcional ?filter=valid|risky|invalid|unvalidated
router.get('/:id/contacts', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const id = req.params.id;
  const counts = {
    total: db.prepare("SELECT COUNT(*) n FROM contacts WHERE list_id = ? AND status='active'").get(id).n,
    valid: db.prepare("SELECT COUNT(*) n FROM contacts WHERE list_id = ? AND status='active' AND validation='valid'").get(id).n,
    risky: db.prepare("SELECT COUNT(*) n FROM contacts WHERE list_id = ? AND status='active' AND validation='risky'").get(id).n,
    invalid: db.prepare("SELECT COUNT(*) n FROM contacts WHERE list_id = ? AND status='active' AND validation='invalid'").get(id).n,
    unvalidated: db.prepare("SELECT COUNT(*) n FROM contacts WHERE list_id = ? AND status='active' AND validation IS NULL").get(id).n
  };
  const filter = req.query.filter;
  let where = 'list_id = ?';
  const params = [id];
  if (filter === 'valid' || filter === 'risky' || filter === 'invalid') { where += ' AND validation = ?'; params.push(filter); }
  else if (filter === 'unvalidated') { where += ' AND validation IS NULL'; }
  const contacts = db.prepare(`SELECT id, email, name, status, validation, validation_reason, created_at FROM contacts WHERE ${where} ORDER BY (validation='invalid') DESC, (validation='risky') DESC, email ASC LIMIT 1000`).all(...params);
  res.json({ contacts, counts, shown: contacts.length });
});

// Eliminar un contacto puntual de la lista.
router.delete('/:id/contacts/:cid', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const r = db.prepare('DELETE FROM contacts WHERE id = ? AND list_id = ?').run(req.params.cid, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Contacto no encontrado' });
  res.json({ ok: true });
});

// Eliminar varios contactos seleccionados a la vez.
router.post('/:id/contacts/delete-batch', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'No se enviaron contactos a eliminar' });
  const del = db.prepare('DELETE FROM contacts WHERE id = ? AND list_id = ?');
  let deleted = 0;
  db.transaction(() => { for (const cid of ids) deleted += del.run(cid, req.params.id).changes; })();
  res.json({ ok: true, deleted });
});

// Eliminar en bloque por estado: which = invalid | risky | both
router.post('/:id/contacts/purge', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const which = req.body?.which;
  let sql;
  if (which === 'invalid') sql = "DELETE FROM contacts WHERE list_id = ? AND validation = 'invalid'";
  else if (which === 'risky') sql = "DELETE FROM contacts WHERE list_id = ? AND validation = 'risky'";
  else if (which === 'both') sql = "DELETE FROM contacts WHERE list_id = ? AND validation IN ('invalid','risky')";
  else return res.status(400).json({ error: 'Parámetro which inválido' });
  const r = db.prepare(sql).run(req.params.id);
  res.json({ ok: true, deleted: r.changes });
});

// Alta individual (normaliza a minúscula y valida el dominio).
router.post('/:id/contacts', async (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });

  const email = normalizeEmail(req.body.email);
  const name = (req.body.name || '').trim() || null;
  if (!email || !checkSyntax(email)) return res.status(400).json({ error: 'Email inválido' });

  try {
    const result = db.prepare(
      'INSERT INTO contacts (list_id, email, name, unsubscribe_token) VALUES (?,?,?,?)'
    ).run(req.params.id, email, name, randomBytes(32).toString('hex'));
    const v = await validateEmail(email);
    db.prepare("UPDATE contacts SET validation=?, validation_reason=?, validated_at=datetime('now') WHERE id=?")
      .run(v.result, v.reason, result.lastInsertRowid);
    res.json({ id: result.lastInsertRowid, email, name, validation: v.result, validation_reason: v.reason });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'El email ya existe en esta lista' });
    }
    throw err;
  }
});

// Subida por archivo CSV / Excel (.csv, .xls, .xlsx).
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  try {
    const parsed = parseFileToContacts(req.file.path);
    const s = await ingestContacts(req.params.id, parsed);
    res.json({ ...s, message: summaryMessage(s) });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el archivo (¿es un CSV o Excel válido?)' });
  } finally {
    try { unlinkSync(req.file.path); } catch (e) { /* ignore */ }
  }
});

// Pegar la lista como texto (un correo por línea; soporta copiar/pegar desde Excel).
router.post('/:id/paste', async (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const text = req.body?.text;
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Pega al menos un correo' });
  const parsed = parseTextToContacts(text);
  if (!parsed.length) return res.status(400).json({ error: 'No se encontró ningún correo en el texto' });
  const s = await ingestContacts(req.params.id, parsed);
  res.json({ ...s, message: summaryMessage(s) });
});

// Revalidar TODOS los contactos activos de la lista (sintaxis + MX).
router.post('/:id/validate', async (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const contacts = db.prepare("SELECT id, email FROM contacts WHERE list_id = ? AND status = 'active'").all(req.params.id);
  if (!contacts.length) return res.json({ total: 0, valid: 0, risky: 0, invalid: 0, message: 'La lista no tiene contactos activos' });

  const results = await validateMany(contacts.map(c => c.email));
  const upd = db.prepare("UPDATE contacts SET validation=?, validation_reason=?, validated_at=datetime('now') WHERE id=?");
  let valid = 0, risky = 0, invalid = 0;
  db.transaction(() => {
    contacts.forEach((c, i) => {
      const r = results[i] || { result: 'risky', reason: 'no verificado' };
      upd.run(r.result, r.reason, c.id);
      if (r.result === 'valid') valid++;
      else if (r.result === 'risky') risky++;
      else invalid++;
    });
  })();

  const parts = [`${valid} válidos`];
  if (risky) parts.push(`${risky} riesgosos`);
  if (invalid) parts.push(`${invalid} inválidos (no se enviarán)`);
  res.json({ total: contacts.length, valid, risky, invalid, message: parts.join(', ') });
});

// Campos personalizados disponibles en una lista (claves de atributos importados).
router.get('/:id/fields', (req, res) => {
  if (!getOwnedList(req)) return res.status(404).json({ error: 'Lista no encontrada' });
  const rows = db.prepare('SELECT attributes FROM contacts WHERE list_id = ? AND attributes IS NOT NULL LIMIT 3000').all(req.params.id);
  const set = new Set();
  for (const r of rows) { try { Object.keys(JSON.parse(r.attributes)).forEach(k => set.add(k)); } catch (e) {} }
  res.json({ fields: [...set] });
});

export default router;
