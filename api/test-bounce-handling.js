/**
 * Test E2E para Bounce Handling via SES + SNS
 * Ejecutar: node test-bounce-handling.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { handleSESBounce, getCampaignBounceStats, detectBounceSpikesByCampaign } from './api/services/bounce-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// Usar BD de test en memoria
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');
testDb.pragma('foreign_keys = ON');

// Crear tablas
testDb.exec(`
  CREATE TABLE IF NOT EXISTS distributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distributor_id INTEGER NOT NULL REFERENCES distributors(id),
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES contact_lists(id),
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced')),
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
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','paused','failed'))
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
`);

// Datos de test
const dist = testDb.prepare('INSERT INTO distributors (name) VALUES (?)').run('Test Distributor');
const list = testDb.prepare('INSERT INTO contact_lists (distributor_id, name) VALUES (?,?)').run(dist.lastInsertRowid, 'Test List');

// Crear contactos
const testEmails = [
  { email: 'hard-bounce@example.com', name: 'Hard Bounce User' },
  { email: 'soft-bounce@example.com', name: 'Soft Bounce User' },
  { email: 'active@example.com', name: 'Active User' }
];

for (const c of testEmails) {
  testDb.prepare('INSERT INTO contacts (list_id, email, name, status) VALUES (?,?,?,?)').run(list.lastInsertRowid, c.email, c.name, 'active');
}

// Crear campaña
const campaign = testDb.prepare(`
  INSERT INTO campaigns (distributor_id, list_id, name, subject, from_name, from_email, body_html, status)
  VALUES (?,?,?,?,?,?,?,'sent')
`).run(dist.lastInsertRowid, list.lastInsertRowid, 'Test Campaign', 'Test Subject', 'Test Sender', 'sender@test.com', '<p>Test</p>');

// Insertar sends iniciales
for (const c of testEmails) {
  testDb.prepare(`
    INSERT INTO campaign_sends (campaign_id, email, name, status, sent_at)
    VALUES (?,?,?,'sent',datetime('now'))
  `).run(campaign.lastInsertRowid, c.email, c.name);
}

console.log('\n=== TEST BOUNCE HANDLING ===\n');
console.log('Test 1: Procesar Hard Bounce');
console.log('-----------------------------');

// Simular webhook SNS con hard bounce
const hardBounceResult = handleSESBounce('Permanent', [
  { emailAddress: 'hard-bounce@example.com', status: '5.1.1' }
]);

console.log('Resultado:', JSON.stringify(hardBounceResult, null, 2));

// Verificar que bounce_status se actualizó
const hardBounceRecord = testDb.prepare('SELECT * FROM campaign_sends WHERE email = ?').get('hard-bounce@example.com');
console.log('\nCampaign send record después de hard bounce:');
console.log(`  - bounce_status: ${hardBounceRecord.bounce_status} (esperado: 'hard')`);
console.log(`  - status: ${hardBounceRecord.status} (esperado: 'bounced')`);

// Verificar que contact status cambió
const hardBounceContact = testDb.prepare('SELECT status FROM contacts WHERE email = ?').get('hard-bounce@example.com');
console.log(`  - contact.status: ${hardBounceContact.status} (esperado: 'bounced')`);

console.log('\n\nTest 2: Procesar Soft Bounce');
console.log('-----------------------------');

const softBounceResult = handleSESBounce('Temporary', [
  { emailAddress: 'soft-bounce@example.com', status: '4.2.3' }
]);

console.log('Resultado:', JSON.stringify(softBounceResult, null, 2));

const softBounceRecord = testDb.prepare('SELECT * FROM campaign_sends WHERE email = ?').get('soft-bounce@example.com');
console.log('\nCampaign send record después de soft bounce:');
console.log(`  - bounce_status: ${softBounceRecord.bounce_status} (esperado: 'soft')`);
console.log(`  - status: ${softBounceRecord.status} (esperado: 'bounced')`);

const softBounceContact = testDb.prepare('SELECT status FROM contacts WHERE email = ?').get('soft-bounce@example.com');
console.log(`  - contact.status: ${softBounceContact.status} (esperado: 'active' - soft bounces no marcan como bounced)`);

console.log('\n\nTest 3: Estadísticas de Bounces por Campaña');
console.log('---------------------------------------------');

const stats = getCampaignBounceStats(campaign.lastInsertRowid);
console.log('Stats:', JSON.stringify(stats, null, 2));
console.log(`  - Hard bounces: ${stats.hardBounces} (esperado: 1)`);
console.log(`  - Soft bounces: ${stats.softBounces} (esperado: 1)`);
console.log(`  - Total bounced: ${stats.totalBounced} (esperado: 2)`);

console.log('\n\nTest 4: Multi-recipient bounce (Permanent)');
console.log('------------------------------------------');

// Crear más sends para testar multi-recipient
const email1 = 'batch1@example.com';
const email2 = 'batch2@example.com';

testDb.prepare('INSERT INTO contacts (list_id, email, status) VALUES (?,?,?)').run(list.lastInsertRowid, email1, 'active');
testDb.prepare('INSERT INTO contacts (list_id, email, status) VALUES (?,?,?)').run(list.lastInsertRowid, email2, 'active');

testDb.prepare('INSERT INTO campaign_sends (campaign_id, email, status, sent_at) VALUES (?,?,?,datetime(\'now\'))').run(campaign.lastInsertRowid, email1, 'sent');
testDb.prepare('INSERT INTO campaign_sends (campaign_id, email, status, sent_at) VALUES (?,?,?,datetime(\'now\'))').run(campaign.lastInsertRowid, email2, 'sent');

const batchResult = handleSESBounce('Permanent', [
  { emailAddress: email1, status: '5.1.1' },
  { emailAddress: email2, status: '5.1.2' }
]);

console.log('Batch result:', JSON.stringify(batchResult, null, 2));
console.log(`  - Total procesados: ${batchResult.totalProcessed} (esperado: 2)`);

const finalStats = getCampaignBounceStats(campaign.lastInsertRowid);
console.log('\nEstadísticas finales de la campaña:');
console.log(`  - Hard bounces: ${finalStats.hardBounces} (esperado: 3)`);
console.log(`  - Soft bounces: ${finalStats.softBounces} (esperado: 1)`);
console.log(`  - Total bounced: ${finalStats.totalBounced} (esperado: 4)`);

console.log('\n=== TODOS LOS TESTS COMPLETADOS ===\n');
