import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { TEMPLATES } from './templates-data.js';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'mailux.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS distributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distributor_id INTEGER REFERENCES distributors(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','distributor')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distributor_id INTEGER NOT NULL REFERENCES distributors(id),
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced')),
    unsubscribe_token TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(list_id, email)
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distributor_id INTEGER NOT NULL REFERENCES distributors(id),
    list_id INTEGER REFERENCES contact_lists(id),
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    from_name TEXT NOT NULL,
    from_email TEXT NOT NULL,
    body_html TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','paused','failed')),
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    bounced INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    scheduled_at TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaign_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','bounced','failed')),
    bounce_status TEXT CHECK(bounce_status IN (NULL, 'soft', 'hard')),
    sent_at TEXT,
    opened_at TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS campaign_opens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    email TEXT NOT NULL,
    opened_at TEXT DEFAULT (datetime('now')),
    user_agent TEXT,
    ip_address TEXT
  );

  CREATE TABLE IF NOT EXISTS click_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    email TEXT NOT NULL,
    url TEXT NOT NULL,
    clicked_at TEXT DEFAULT (datetime('now')),
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_click_tracking_campaign ON click_tracking(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_click_tracking_email ON click_tracking(email);
  CREATE INDEX IF NOT EXISTS idx_click_tracking_url ON click_tracking(url);

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    body_html TEXT NOT NULL,
    variables TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: Add unsubscribe_token column if it doesn't exist
try {
  db.prepare('SELECT unsubscribe_token FROM contacts LIMIT 1').get();
} catch (err) {
  if (err.message.includes('no such column')) {
    console.log('Migrating: Adding unsubscribe_token column to contacts...');
    db.exec('ALTER TABLE contacts ADD COLUMN unsubscribe_token TEXT;');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribe_token ON contacts(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;');
    console.log('Migration complete');
  }
}

// Migration: validación de correos (sintaxis + MX) para bajar el bounce rate.
// validation: 'valid' | 'risky' | 'invalid' | NULL (sin validar todavía).
try {
  db.prepare('SELECT validation FROM contacts LIMIT 1').get();
} catch (err) {
  if (err.message.includes('no such column')) {
    console.log('Migrating: Adding validation columns to contacts...');
    db.exec('ALTER TABLE contacts ADD COLUMN validation TEXT;');
    db.exec('ALTER TABLE contacts ADD COLUMN validation_reason TEXT;');
    db.exec('ALTER TABLE contacts ADD COLUMN validated_at TEXT;');
    console.log('Migration complete');
  }
}

// Migration: campos personalizados por contacto (JSON) para usar {{campo}} en el correo.
try { db.prepare('SELECT attributes FROM contacts LIMIT 1').get(); }
catch (err) { if (err.message.includes('no such column')) { console.log('Migrating: contacts.attributes'); db.exec('ALTER TABLE contacts ADD COLUMN attributes TEXT;'); } }

// Migration: segmento opcional por campaña (enviar solo a quienes cumplen un filtro de atributo).
try { db.prepare('SELECT segment_key FROM campaigns LIMIT 1').get(); }
catch (err) { if (err.message.includes('no such column')) { console.log('Migrating: campaigns.segment_key/value'); db.exec('ALTER TABLE campaigns ADD COLUMN segment_key TEXT;'); db.exec('ALTER TABLE campaigns ADD COLUMN segment_value TEXT;'); } }

// Migration: envío por GOTEO (drip). daily_limit = máximo de correos por día para esta
// campaña (NULL = envío normal, todo de una vez). last_send_date = fecha (YYYY-MM-DD) del
// último lote diario ya enviado, para no repetir lote el mismo día y reanudar al siguiente.
try { db.prepare('SELECT daily_limit FROM campaigns LIMIT 1').get(); }
catch (err) { if (err.message.includes('no such column')) { console.log('Migrating: campaigns.daily_limit/last_send_date (goteo)'); db.exec('ALTER TABLE campaigns ADD COLUMN daily_limit INTEGER;'); db.exec('ALTER TABLE campaigns ADD COLUMN last_send_date TEXT;'); } }

// Migration: permitir los estados 'paused' y 'scheduled' en campaigns.status.
// La tabla se creó con un CHECK que solo aceptaba draft/sending/sent/failed, pero los endpoints
// de Pausar y Programar guardan 'paused' y 'scheduled' -> fallaban con error 500 y una campaña
// en marcha NO se podía detener. SQLite no deja modificar un CHECK: hay que reconstruir la tabla
// copiando los datos. Idempotente: solo actúa si el CHECK viejo sigue presente.
try {
  const sqlCampaigns = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='campaigns'").get()?.sql || '';
  const checkViejo = "CHECK(status IN ('draft','sending','sent','failed'))";
  if (sqlCampaigns.includes(checkViejo)) {
    console.log('Migrating: campaigns.status ahora admite paused/scheduled');
    const columnas = db.prepare('PRAGMA table_info(campaigns)').all().map(c => c.name).join(', ');
    const sqlNueva = sqlCampaigns
      .replace('CREATE TABLE campaigns', 'CREATE TABLE campaigns_nueva')
      .replace(checkViejo, "CHECK(status IN ('draft','scheduled','sending','paused','sent','failed'))");
    db.pragma('foreign_keys = OFF');
    db.pragma('legacy_alter_table = ON');
    db.exec('BEGIN');
    db.exec(sqlNueva);
    db.exec(`INSERT INTO campaigns_nueva (${columnas}) SELECT ${columnas} FROM campaigns`);
    db.exec('DROP TABLE campaigns');
    db.exec('ALTER TABLE campaigns_nueva RENAME TO campaigns');
    db.exec('COMMIT');
    db.pragma('legacy_alter_table = OFF');
    db.pragma('foreign_keys = ON');
    console.log('Migrating: campaigns.status OK');
  }
} catch (err) {
  console.error('Migration campaigns.status FALLÓ:', err.message);
}

// Migration: interruptor por lista para incluir o no los correos 'risky' en el envío.
// Por defecto 0 = NO se envían los riesgosos (más seguro contra sanciones de AWS).
try {
  db.prepare('SELECT send_risky FROM contact_lists LIMIT 1').get();
} catch (err) {
  if (err.message.includes('no such column')) {
    console.log('Migrating: Adding send_risky column to contact_lists...');
    db.exec('ALTER TABLE contact_lists ADD COLUMN send_risky INTEGER DEFAULT 0;');
    console.log('Migration complete');
  }
}

// Lista de supresión GLOBAL: correos que nunca deben recibir envíos (rebote duro,
// queja de spam, o baja voluntaria). Se cruza al enviar para no reincidir.
db.exec(`
  CREATE TABLE IF NOT EXISTS suppression (
    email TEXT PRIMARY KEY,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS landing_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distributor_id INTEGER NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    body TEXT,
    button_text TEXT DEFAULT 'Suscribirme',
    color TEXT DEFAULT '#2563eb',
    image_url TEXT,
    list_id INTEGER,
    submissions INTEGER DEFAULT 0,
    welcome_enabled INTEGER DEFAULT 0,
    welcome_from TEXT,
    welcome_subject TEXT,
    welcome_html TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migración: correo de bienvenida automático en landing_pages (para instalaciones previas).
for (const col of ['welcome_enabled INTEGER DEFAULT 0', 'welcome_from TEXT', 'welcome_subject TEXT', 'welcome_html TEXT']) {
  const name = col.split(' ')[0];
  try { db.prepare(`SELECT ${name} FROM landing_pages LIMIT 1`).get(); }
  catch (e) { if (String(e.message).includes('no such column')) db.exec(`ALTER TABLE landing_pages ADD COLUMN ${col};`); }
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@mailux.com');
if (!existing) {
  const hash = createHash('sha256').update('mailux2024').digest('hex');
  const dist = db.prepare('INSERT INTO distributors (name) VALUES (?)').run('Mailux Admin');
  db.prepare('INSERT INTO users (distributor_id, email, password_hash, role) VALUES (?,?,?,?)').run(dist.lastInsertRowid, 'admin@mailux.com', hash, 'admin');
}

// Plantillas predefinidas (idempotente): quita las básicas viejas y asegura las bonitas.
try {
  db.prepare("DELETE FROM templates WHERE name IN ('Newsletter','Promoción')").run();
  const upT = db.prepare('INSERT OR REPLACE INTO templates (name, description, body_html, variables) VALUES (?,?,?,?)');
  for (const t of TEMPLATES) upT.run(t.name, t.description, t.body_html, JSON.stringify(t.variables));
  console.log(`Plantillas predefinidas: ${TEMPLATES.length} aseguradas`);
} catch (err) {
  console.error('Error al sembrar plantillas:', err.message);
}

export default db;
