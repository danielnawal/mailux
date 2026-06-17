import Database from 'better-sqlite3';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4600/api';
const DB_PATH = '/opt/mailux/data/mailux.db';

const TEST_USER = 'admin@mailux.com';
const TEST_PASSWORD = 'mailux2024';
const TEST_EMAIL = `prueba${Date.now()}@test.com`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
  console.log('1. Login al portal...');
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
  console.log('   [OK] Login exitoso\n');
  return data.token;
}

async function createList(token) {
  const listName = `Test List ${Date.now()}`;

  const response = await fetch(`${API_URL}/lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: listName })
  });

  if (!response.ok) throw new Error(`Create list failed: ${response.statusText}`);
  const data = await response.json();
  return data.id;
}

async function addContact(token, listId, email, name) {
  const response = await fetch(`${API_URL}/lists/${listId}/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ email, name })
  });

  if (!response.ok) throw new Error(`Add contact failed: ${response.statusText}`);
}

async function createCampaign(token, listId) {
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

  if (!response.ok) throw new Error(`Create campaign failed: ${response.statusText}`);
  const data = await response.json();
  return data.id;
}

async function sendCampaign(token, campaignId) {
  const response = await fetch(`${API_URL}/campaigns/${campaignId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) throw new Error(`Send campaign failed: ${response.statusText}`);
}

async function runTest() {
  console.log('\n=== PRUEBA E2E: Click Tracking en Mailux ===\n');

  try {
    const token = await login();

    console.log('2. Crear campaña con links...');
    const listId = await createList(token);
    await addContact(token, listId, TEST_EMAIL, 'Usuario Prueba');
    const campaignId = await createCampaign(token, listId);
    console.log(`   [OK] Campaña creada con ID: ${campaignId}\n`);

    console.log('3. Enviar a contacto prueba...');
    await sendCampaign(token, campaignId);
    console.log('   [OK] Campaña enviada\n');

    await sleep(2000);

    const db = new Database(DB_PATH);

    // Obtener HTML ANTES (original)
    console.log('4. HTML ORIGINAL (sin tracking):');
    const campaign = db.prepare('SELECT body_html FROM campaigns WHERE id = ?').get(campaignId);
    const originalHtml = campaign.body_html;
    console.log('---INICIO---');
    console.log(originalHtml);
    console.log('---FIN---\n');

    // Obtener HTML ENVIADO (reescrito con tracking)
    console.log('5. HTML ENVIADO (con tracking reescrito):');
    const campaignSends = db.prepare('SELECT html FROM campaign_sends WHERE campaign_id = ?').get(campaignId);
    const sentHtml = campaignSends?.html || '';
    console.log('---INICIO---');
    console.log(sentHtml);
    console.log('---FIN---\n');

    // Extraer URLs de tracking
    console.log('6. URLs de tracking encontradas en email:');
    const trackingUrls = [];
    const urlRegex = /href="([^"]*track-click[^"]*)"/g;
    let match;
    let urlCount = 0;

    while ((match = urlRegex.exec(sentHtml)) !== null) {
      const fullUrl = match[1].startsWith('http') ? match[1] : `http://localhost:4600${match[1]}`;
      trackingUrls.push(fullUrl);
      urlCount++;
      console.log(`   ${urlCount}. ${fullUrl}`);
    }

    if (urlCount === 0) {
      console.log('   [ADVERTENCIA] No se encontraron URLs de tracking reescritas\n');
    } else {
      console.log(`   [OK] ${urlCount} URLs de tracking encontradas\n`);
    }

    // Verificar tabla click_tracking ANTES
    console.log('7. Clicks registrados en BD ANTES de hacer click:');
    const clicksBefore = db.prepare('SELECT COUNT(*) as count FROM click_tracking WHERE campaign_id = ?').get(campaignId);
    console.log(`   Total: ${clicksBefore.count}\n`);

    // Simular clicks
    console.log('8. Hacer clic en primer link en email...');
    const res1 = await fetch(trackingUrls[0], { redirect: 'follow' });
    console.log(`   [OK] Redirect status: ${res1.status}\n`);

    await sleep(300);

    console.log('9. Verificar stats: mostrar "1 click en Google, 0 en Ejemplo"...');
    const statsAfterFirst = db.prepare(`
      SELECT url, COUNT(*) as count FROM click_tracking
      WHERE campaign_id = ? GROUP BY url ORDER BY count DESC
    `).all(campaignId);

    if (statsAfterFirst.length > 0) {
      statsAfterFirst.forEach((stat, idx) => {
        const isGoogle = stat.url.includes('google') ? 'Google' : 'Ejemplo';
        console.log(`   ${isGoogle}: ${stat.count} click(s)`);
      });
    }
    console.log();

    console.log('10. Hacer clic en segundo link...');
    const res2 = await fetch(trackingUrls[1], { redirect: 'follow' });
    console.log(`   [OK] Redirect status: ${res2.status}\n`);

    await sleep(300);

    console.log('11. Verificar stats: mostrar "1 click en Google, 1 en Ejemplo"...');
    const statsAfterSecond = db.prepare(`
      SELECT url, COUNT(*) as count FROM click_tracking
      WHERE campaign_id = ? GROUP BY url ORDER BY url
    `).all(campaignId);

    if (statsAfterSecond.length > 0) {
      statsAfterSecond.forEach((stat) => {
        const isGoogle = stat.url.includes('google') ? 'Google' : 'Ejemplo';
        console.log(`   ${isGoogle}: ${stat.count} click(s)`);
      });
    }
    console.log();

    // Stats finales
    console.log('12. Stats finales de la campaña:');
    const response = await fetch(`${API_URL}/campaigns/${campaignId}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const stats = await response.json();
    console.log(`   Enviados: ${stats.by_status?.sent || 0}`);
    console.log(`   Clicados (emails únicos): ${stats.clicked || 0}`);
    console.log(`   Links con clicks: ${stats.link_stats?.length || 0}`);

    if (stats.link_stats && stats.link_stats.length > 0) {
      console.log(`\n   Detalles por link:`);
      stats.link_stats.forEach(link => {
        const domain = link.url.includes('google') ? 'Google' : 'Ejemplo';
        console.log(`   - ${domain}: ${link.count} clicks totales, ${link.unique_clicks} emails únicos`);
      });
    }

    console.log('\n=== TABLA click_tracking (registros finales) ===\n');
    const allClicks = db.prepare('SELECT * FROM click_tracking WHERE campaign_id = ? ORDER BY clicked_at').all(campaignId);
    console.log(`Total registros: ${allClicks.length}`);
    allClicks.forEach((click, idx) => {
      console.log(`${idx + 1}. Email: ${click.email}`);
      console.log(`   URL: ${click.url}`);
      console.log(`   IP: ${click.ip}`);
      console.log(`   User-Agent: ${click.user_agent}`);
      console.log(`   Timestamp: ${click.clicked_at}`);
      console.log();
    });

    console.log('=== RESULTADO FINAL ===\n');
    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Email enviado a: ${TEST_EMAIL}`);
    console.log(`URLs reescritas en HTML: ${urlCount}`);
    console.log(`Clicks simulados: 2`);
    console.log(`Clicks registrados en click_tracking: ${allClicks.length}`);

    if (allClicks.length === 2 && urlCount > 0) {
      console.log('\n[EXITO] Click tracking funcionando correctamente');
    } else {
      console.log('\n[ADVERTENCIA] Resultado inesperado');
    }

    db.close();

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    process.exit(1);
  }
}

runTest();
