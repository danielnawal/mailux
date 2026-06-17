import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4600/api';
const DB_PATH = '/opt/mailux/data/mailux.db';

// Datos de prueba
const TEST_USER = 'admin@mailux.com';
const TEST_PASSWORD = 'mailux2024';
const TEST_EMAIL = `prueba${Date.now()}@test.com`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAuthToken() {
  // El token se obtiene del login
  return null; // Se asignará después del login
}

async function login() {
  console.log('1. Realizando login...');
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_USER,
      password: TEST_PASSWORD
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('   [OK] Login exitoso');
  return data.token;
}

async function createList(token) {
  console.log('\n2. Creando lista de contactos...');
  const listName = `Test List ${Date.now()}`;

  const response = await fetch(`${API_URL}/lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: listName })
  });

  if (!response.ok) {
    throw new Error(`Create list failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`   [OK] Lista creada con ID: ${data.id}`);
  return { id: data.id, name: listName };
}

async function addContact(token, listId, email, name) {
  console.log(`\n3. Agregando contacto: ${email}...`);

  const response = await fetch(`${API_URL}/lists/${listId}/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ email, name })
  });

  if (!response.ok) {
    throw new Error(`Add contact failed: ${response.statusText}`);
  }

  console.log(`   [OK] Contacto agregado`);
}

async function createCampaign(token, listId) {
  console.log('\n4. Creando campaña con links...');

  const campaignData = {
    name: `Test Click Tracking ${Date.now()}`,
    subject: `Test Subject ${Date.now()}`,
    from_name: 'Test Sender',
    from_email: 'test@example.com',
    list_id: listId,
    body_html: `
      <html>
        <body>
          <h1>Test Email Click Tracking</h1>
          <p>Haz click en los siguientes enlaces:</p>
          <p><a href="https://www.google.com">Ir a Google</a></p>
          <p><a href="https://www.ejemplo.com">Ir a Ejemplo</a></p>
        </body>
      </html>
    `
  };

  const response = await fetch(`${API_URL}/campaigns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(campaignData)
  });

  if (!response.ok) {
    throw new Error(`Create campaign failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`   [OK] Campaña creada con ID: ${data.id}`);
  return data.id;
}

async function sendCampaign(token, campaignId) {
  console.log('\n5. Enviando campaña...');

  const response = await fetch(`${API_URL}/campaigns/${campaignId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Send campaign failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`   [OK] Campaña enviada a ${data.total} contacto(s)`);
}

async function sleep2(ms) {
  console.log(`   Esperando ${ms}ms para que se procese el envío...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('\n=== TEST E2E: Click Tracking ===\n');

  try {
    // Login
    const token = await login();

    // Crear lista
    const list = await createList(token);

    // Agregar contacto
    await addContact(token, list.id, TEST_EMAIL, 'Usuario Prueba');

    // Crear campaña
    const campaignId = await createCampaign(token, list.id);

    // Enviar campaña
    await sendCampaign(token, campaignId);

    // Esperar a que se procese
    await sleep2(3000);

    // Conectarse a la BD local y verificar datos
    console.log('\n6. Verificando datos en BD...');
    const db = new Database(DB_PATH);

    // Obtener HTML enviado
    const campaignSends = db.prepare(`
      SELECT email, name, status, sent_at FROM campaign_sends WHERE campaign_id = ?
    `).all(campaignId);

    console.log(`   [OK] Campanha enviada a ${campaignSends.length} contacto(s)`);

    // Mostrar email enviado
    if (campaignSends.length > 0) {
      console.log(`   Email: ${campaignSends[0].email}`);
      console.log(`   Status: ${campaignSends[0].status}`);
    }

    // Verificar HTML antes de clicks
    const campaignData = db.prepare('SELECT body_html FROM campaigns WHERE id = ?').get(campaignId);
    const originalHtml = campaignData.body_html;

    console.log('\n7. HTML ORIGINAL (antes de reescritura):');
    console.log('   ' + originalHtml.replace(/\n/g, '\n   '));

    // Obtener registros de click_tracking ANTES
    const clicksBefore = db.prepare('SELECT COUNT(*) as count FROM click_tracking WHERE campaign_id = ?').get(campaignId);
    console.log(`\n8. Clicks registrados ANTES de simular: ${clicksBefore.count}`);

    // Simular clicks
    console.log('\n9. Simulando clicks en URLs de tracking...');

    // URLs de tracking que debería haber reescrito
    const trackingUrl1 = `http://localhost:4600/api/campaigns/${campaignId}/track-click?url=https%3A%2F%2Fwww.google.com&email=${encodeURIComponent(TEST_EMAIL)}`;
    const trackingUrl2 = `http://localhost:4600/api/campaigns/${campaignId}/track-click?url=https%3A%2F%2Fwww.ejemplo.com&email=${encodeURIComponent(TEST_EMAIL)}`;

    console.log(`   Link 1: ${trackingUrl1}`);
    try {
      const res1 = await fetch(trackingUrl1, { redirect: 'follow' });
      console.log(`   [OK] Click 1 registrado (status: ${res1.status})`);
    } catch (err) {
      console.log(`   [ERROR] Click 1 falló: ${err.message}`);
    }

    await sleep(500);

    console.log(`   Link 2: ${trackingUrl2}`);
    try {
      const res2 = await fetch(trackingUrl2, { redirect: 'follow' });
      console.log(`   [OK] Click 2 registrado (status: ${res2.status})`);
    } catch (err) {
      console.log(`   [ERROR] Click 2 falló: ${err.message}`);
    }

    await sleep(1000);

    // Verificar click_tracking DESPUÉS
    console.log('\n10. Verificando tabla click_tracking DESPUÉS de clicks...');

    const clicksAfter = db.prepare('SELECT * FROM click_tracking WHERE campaign_id = ?').all(campaignId);
    console.log(`   Total clicks registrados: ${clicksAfter.length}`);

    if (clicksAfter.length > 0) {
      console.log('\n11. Detalles de clicks por URL:');
      const linkStats = db.prepare(`
        SELECT url, COUNT(*) as count, COUNT(DISTINCT email) as unique_clicks
        FROM click_tracking
        WHERE campaign_id = ?
        GROUP BY url
        ORDER BY count DESC
      `).all(campaignId);

      for (const stat of linkStats) {
        console.log(`   URL: ${stat.url}`);
        console.log(`   - Clicks totales: ${stat.count}`);
        console.log(`   - Clicks únicos (emails): ${stat.unique_clicks}`);
      }
    }

    // Obtener stats de la campaña
    console.log('\n12. Stats de la campaña:');
    const response = await fetch(`${API_URL}/campaigns/${campaignId}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const stats = await response.json();
    console.log(`   Total enviados: ${stats.by_status?.sent || 0}`);
    console.log(`   Abiertos: ${stats.opened || 0}`);
    console.log(`   Clicados: ${stats.clicked || 0}`);
    console.log(`   Link stats: ${stats.link_stats?.length || 0} URLs diferentes`);

    // Reporte final
    console.log('\n=== REPORTE FINAL ===\n');
    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Distributor ID: 1 (admin)`);
    console.log(`List ID: ${list.id}`);
    console.log(`Email de prueba: ${TEST_EMAIL}`);
    console.log(`\nResultados:`);
    console.log(`  - Clicks simulados: 2`);
    console.log(`  - Clicks registrados en BD: ${clicksAfter.length}`);
    console.log(`  - Urls diferentes: ${stats.link_stats?.length || 0}`);

    if (clicksAfter.length === 2) {
      console.log('\nESTADO: [EXITO] Click tracking funcionando correctamente');
    } else if (clicksAfter.length > 0) {
      console.log(`\nESTADO: [PARCIAL] Se registraron ${clicksAfter.length}/2 clicks esperados`);
    } else {
      console.log('\nESTADO: [FALLO] No se registraron clicks');
    }

    db.close();

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTest();
