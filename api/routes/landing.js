import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateEmail, checkSyntax } from '../services/validator.js';
import { isSuppressed } from '../services/suppression.js';
import { sendEmail } from '../services/ses.js';

const BASE_URL = process.env.MAILUX_BASE_URL || 'https://mailux.gpssoftwarenumberone.com';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function slugify(s) {
  return String(s || 'pagina').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pagina';
}

// Render de la página pública (responsive, con formulario de captura).
function renderPage(p) {
  const color = /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#2563eb';
  const bodyHtml = esc(p.body || '').split(/\n+/).filter(Boolean).map(x => `<p style="margin:0 0 12px;color:#475569;font-size:16px;line-height:1.7">${x}</p>`).join('');
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="" style="max-width:100%;border-radius:12px;margin-bottom:18px">` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px 14px;min-height:100vh">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.08)">
  <div style="height:8px;background:${color}"></div>
  <div style="padding:34px 30px">
    ${img}
    <h1 style="margin:0 0 8px;font-size:28px;color:#0f172a">${esc(p.title)}</h1>
    ${p.subtitle ? `<p style="margin:0 0 18px;color:${color};font-size:17px;font-weight:600">${esc(p.subtitle)}</p>` : ''}
    ${bodyHtml}
    <form id="f" style="margin-top:22px">
      <input id="name" placeholder="Tu nombre" style="width:100%;box-sizing:border-box;padding:13px 14px;margin:0 0 12px;border:1px solid #cbd5e1;border-radius:9px;font-size:15px">
      <input id="email" type="email" required placeholder="Tu correo" style="width:100%;box-sizing:border-box;padding:13px 14px;margin:0 0 14px;border:1px solid #cbd5e1;border-radius:9px;font-size:15px">
      <button type="submit" style="width:100%;padding:14px;background:${color};color:#fff;border:0;border-radius:9px;font-size:16px;font-weight:bold;cursor:pointer">${esc(p.button_text || 'Suscribirme')}</button>
    </form>
    <div id="msg" style="margin-top:14px;text-align:center;font-size:14px"></div>
  </div>
</div>
<script>
var f=document.getElementById('f'),msg=document.getElementById('msg');
f.addEventListener('submit',async function(e){e.preventDefault();
  var btn=f.querySelector('button');btn.disabled=true;btn.textContent='Enviando...';
  try{
    var r=await fetch('${BASE_URL}/api/public/capture/${esc(p.slug)}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('name').value,email:document.getElementById('email').value})});
    var d=await r.json();
    if(d.ok){f.style.display='none';msg.style.color='#16a34a';msg.textContent=d.message||'¡Gracias! Quedaste registrado.';}
    else{msg.style.color='#dc2626';msg.textContent=d.error||'No se pudo registrar.';btn.disabled=false;btn.textContent='${esc(p.button_text || 'Suscribirme')}';}
  }catch(err){msg.style.color='#dc2626';msg.textContent='Error de conexión.';btn.disabled=false;btn.textContent='${esc(p.button_text || 'Suscribirme')}';}
});
</script>
</body></html>`;
}

// ---- Router de gestión (autenticado) ----
export const landingManage = Router();
landingManage.use(requireAuth);

landingManage.get('/', (req, res) => {
  const rows = db.prepare('SELECT lp.*, cl.name as list_name FROM landing_pages lp LEFT JOIN contact_lists cl ON cl.id=lp.list_id WHERE lp.distributor_id=? ORDER BY lp.created_at DESC').all(req.user.distributor_id);
  res.json(rows.map(r => ({ ...r, url: `${BASE_URL}/p/${r.slug}` })));
});

landingManage.post('/', (req, res) => {
  const { title, subtitle, body, button_text, color, image_url, list_id } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
  if (!list_id) return res.status(400).json({ error: 'Elige a qué lista entran los registros' });
  const list = db.prepare('SELECT id FROM contact_lists WHERE id=? AND distributor_id=?').get(list_id, req.user.distributor_id);
  if (!list) return res.status(400).json({ error: 'Lista inválida' });
  const w = req.body || {};
  let slug = slugify(title) + '-' + randomBytes(3).toString('hex');
  const r = db.prepare('INSERT INTO landing_pages (distributor_id,slug,title,subtitle,body,button_text,color,image_url,list_id,welcome_enabled,welcome_from,welcome_subject,welcome_html) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.distributor_id, slug, title.trim(), subtitle || null, body || null, button_text || 'Suscribirme', color || '#2563eb', image_url || null, list_id,
      w.welcome_enabled ? 1 : 0, w.welcome_from || null, w.welcome_subject || null, w.welcome_html || null);
  res.json({ id: r.lastInsertRowid, slug, url: `${BASE_URL}/p/${slug}` });
});

landingManage.patch('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM landing_pages WHERE id=? AND distributor_id=?').get(req.params.id, req.user.distributor_id);
  if (!p) return res.status(404).json({ error: 'Página no encontrada' });
  const f = req.body || {};
  db.prepare(`UPDATE landing_pages SET title=COALESCE(?,title), subtitle=?, body=?, button_text=COALESCE(?,button_text), color=COALESCE(?,color), image_url=?, list_id=COALESCE(?,list_id),
      welcome_enabled=?, welcome_from=?, welcome_subject=?, welcome_html=? WHERE id=?`)
    .run(f.title?.trim() || null, f.subtitle || null, f.body || null, f.button_text || null, f.color || null, f.image_url || null, f.list_id || null,
      f.welcome_enabled ? 1 : 0, f.welcome_from || null, f.welcome_subject || null, f.welcome_html || null, req.params.id);
  res.json({ ok: true });
});

landingManage.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM landing_pages WHERE id=? AND distributor_id=?').get(req.params.id, req.user.distributor_id);
  if (!p) return res.status(404).json({ error: 'Página no encontrada' });
  db.prepare('DELETE FROM landing_pages WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Render público de la página (/p/:slug) ----
export const landingPublic = Router();
landingPublic.get('/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM landing_pages WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).send('<h1>Página no encontrada</h1>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPage(p));
});

// ---- Captura pública de leads (/api/public/capture/:slug) ----
export const landingCapture = Router();
landingCapture.post('/capture/:slug', async (req, res) => {
  const p = db.prepare('SELECT * FROM landing_pages WHERE slug=?').get(req.params.slug);
  if (!p || !p.list_id) return res.status(404).json({ error: 'Página no encontrada' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim() || null;
  if (!email || !checkSyntax(email)) return res.status(400).json({ error: 'Pon un correo válido.' });
  if (isSuppressed(email)) return res.json({ ok: true, message: '¡Gracias! Ya estabas registrado.' });

  const v = await validateEmail(email);
  if (v.result === 'invalid') return res.status(400).json({ error: 'Ese correo no parece existir, revísalo.' });

  try {
    db.prepare('INSERT INTO contacts (list_id,email,name,unsubscribe_token,validation,validation_reason,validated_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
      .run(p.list_id, email, name, randomBytes(32).toString('hex'), v.result, v.reason);
  } catch (e) {
    if (!String(e.message).includes('UNIQUE')) throw e;
    // ya estaba en la lista: lo tomamos como éxito
  }
  db.prepare('UPDATE landing_pages SET submissions = submissions + 1 WHERE id=?').run(p.id);
  res.json({ ok: true, message: '¡Gracias! Quedaste registrado.' });

  // Automatización: correo de bienvenida automático (después de responder, sin bloquear).
  if (p.welcome_enabled && p.welcome_from && p.welcome_subject && p.welcome_html) {
    sendWelcome(p, email, name).catch(err => console.error('[LANDING] error bienvenida:', err.message));
  }
});

async function sendWelcome(page, email, name) {
  const c = db.prepare('SELECT unsubscribe_token FROM contacts WHERE list_id=? AND email=?').get(page.list_id, email);
  const unsub = `<a href="${BASE_URL}/api/campaigns/0/unsubscribe?token=${c ? c.unsubscribe_token : ''}" style="color:#999;font-size:12px;text-decoration:none">Cancelar suscripción</a>`;
  let html = String(page.welcome_html).replace(/{{\s*nombre\s*}}/gi, name || email);
  html = html.includes('{{unsubscribe_link}}')
    ? html.replace(/{{unsubscribe_link}}/gi, unsub)
    : html + `<hr style="border:none;border-top:1px solid #eee;margin-top:30px"><div style="text-align:center;padding:14px;font-size:12px;color:#999">${unsub}</div>`;
  await sendEmail({ from: page.welcome_from, fromName: page.title, to: email, subject: page.welcome_subject, html });
  console.log('[LANDING] bienvenida enviada a', email);
}
