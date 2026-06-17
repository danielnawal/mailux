import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { join } from 'path';

const API_URL = 'http://localhost:4600/api';
const FRONTEND_URL = 'http://localhost:4900';
const TEST_USER = 'admin@mailux.com';
const TEST_PASSWORD = 'mailux2024';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('\n=== TEST E2E: Click Tracking ===\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Paso 1: Login
    console.log('1. Login al portal...');
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', TEST_USER);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Iniciar sesión")');
    await page.waitForNavigation();
    await page.waitForLoadState('networkidle');
    console.log('   [OK] Login exitoso');

    // Paso 2: Crear campaña con dos links
    console.log('\n2. Crear campaña con links...');
    await page.click('button:has-text("Nueva Campaña")');
    await page.waitForLoadState('networkidle');

    const campaignName = `Test Click Tracking ${Date.now()}`;
    const subject = `Test Subject ${Date.now()}`;

    await page.fill('input[placeholder*="Nombre"]', campaignName);
    await page.fill('input[placeholder*="Asunto"]', subject);
    await page.fill('input[placeholder*="Remitente"]', 'Test Sender');
    await page.fill('input[placeholder*="Email"]', 'test@example.com');

    // Editor HTML - agregar dos links
    const htmlContent = `
      <html>
        <body>
          <h1>Test Email</h1>
          <p>Click en los siguientes links:</p>
          <a href="https://www.google.com">Google</a>
          <br/>
          <a href="https://www.ejemplo.com">Ejemplo</a>
        </body>
      </html>
    `;

    // Buscar el editor HTML
    const htmlEditor = await page.$('.html-editor, textarea[id*="html"], div[contenteditable]');
    if (htmlEditor) {
      await htmlEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(htmlContent, { delay: 5 });
    }

    await sleep(500);

    // Guardar campaña
    await page.click('button:has-text("Guardar")');
    await page.waitForLoadState('networkidle');
    console.log('   [OK] Campaña creada');

    // Paso 3: Obtener ID de campaña
    const urlMatch = page.url().match(/\/campaigns\/(\d+)/);
    const campaignId = urlMatch ? urlMatch[1] : null;
    if (!campaignId) {
      throw new Error('No se pudo extraer el ID de la campaña de la URL');
    }
    console.log(`   [OK] Campaign ID: ${campaignId}`);

    // Paso 4: Crear lista de contactos
    console.log('\n3. Crear lista de contactos...');
    await page.click('a:has-text("Listas")');
    await page.waitForLoadState('networkidle');

    const listName = `Test List ${Date.now()}`;
    await page.click('button:has-text("Nueva Lista")');
    await page.fill('input[placeholder*="nombre"]', listName);
    await page.click('button:has-text("Crear")');
    await page.waitForLoadState('networkidle');

    const listUrlMatch = page.url().match(/\/lists\/(\d+)/);
    const listId = listUrlMatch ? listUrlMatch[1] : null;
    console.log(`   [OK] Lista creada con ID: ${listId}`);

    // Paso 5: Agregar contacto de prueba
    console.log('\n4. Agregar contacto de prueba...');
    const testEmail = `prueba${Date.now()}@test.com`;

    await page.click('button:has-text("Agregar Contacto")');
    await page.fill('input[placeholder*="email"]', testEmail);
    await page.fill('input[placeholder*="nombre"]', 'Usuario Prueba');
    await page.click('button:has-text("Agregar")');
    await page.waitForLoadState('networkidle');
    console.log(`   [OK] Contacto agregado: ${testEmail}`);

    // Paso 6: Volver a campaña y asignar lista
    console.log('\n5. Asignar lista a campaña...');
    await page.goto(`${FRONTEND_URL}/campaigns/${campaignId}`);
    await page.waitForLoadState('networkidle');

    const listSelect = await page.$('select, button[aria-label*="lista"]');
    if (listSelect) {
      await listSelect.click();
      await page.click(`text="${listName}"`);
      await page.waitForLoadState('networkidle');
    }

    // Paso 7: Enviar campaña
    console.log('\n6. Enviar campaña...');
    await page.click('button:has-text("Enviar")');
    await page.waitForLoadState('networkidle');
    await sleep(3000); // Esperar a que se envíe
    console.log('   [OK] Campaña enviada');

    // Paso 8: Ir a stats
    console.log('\n7. Verificar HTML parseado y stats...');
    await page.click('button:has-text("Estadísticas")');
    await page.waitForLoadState('networkidle');

    // Captura de stats
    const statsContent = await page.content();
    console.log('   [OK] Stats cargadas');

    // Paso 9: Verificar click_tracking en la BD
    console.log('\n8. Verificar tabla click_tracking en BD...');
    const db = new Database('/opt/mailux/data/mailux.db');

    const trackingBefore = db.prepare('SELECT * FROM click_tracking WHERE campaign_id = ?').all(campaignId);
    console.log(`   Clicks registrados ANTES: ${trackingBefore.length}`);

    // Paso 10: Simular clicks en el email
    console.log('\n9. Simular clicks en links...');

    // Obtener URLs reescritas del HTML enviado
    const campaignSends = db.prepare('SELECT html FROM campaign_sends WHERE campaign_id = ?').all(campaignId);
    if (campaignSends.length > 0) {
      const sentHtml = campaignSends[0].html || '';
      console.log(`   Email enviado a ${campaignSends.length} contacto(s)`);

      // Buscar tracking URLs en el HTML
      const trackingUrlRegex = /href="([^"]*track-click[^"]*)"/g;
      let match;
      let clickCount = 0;

      while ((match = trackingUrlRegex.exec(sentHtml)) !== null) {
        const trackingUrl = match[1];
        console.log(`   \n   Haciendo click en: ${trackingUrl.substring(0, 80)}...`);

        const newPage = await browser.newPage();
        newPage.on('popup', async (popup) => {
          await popup.close();
        });

        try {
          await newPage.goto(trackingUrl, { timeout: 5000 });
          await sleep(500);
          console.log(`   [OK] Click registrado`);
          clickCount++;
        } catch (err) {
          console.log(`   [ERROR] No se pudo hacer click: ${err.message}`);
        }

        await newPage.close();
      }

      if (clickCount > 0) {
        console.log(`\n   Total de clicks simulados: ${clickCount}`);
      } else {
        console.log('\n   [ADVERTENCIA] No se encontraron URLs de tracking en el HTML enviado');
      }
    }

    // Paso 11: Verificar registros en click_tracking
    console.log('\n10. Verificar registros en click_tracking...');
    await sleep(2000);

    const trackingAfter = db.prepare('SELECT * FROM click_tracking WHERE campaign_id = ?').all(campaignId);
    console.log(`   \n   Clicks registrados DESPUÉS: ${trackingAfter.length}`);

    if (trackingAfter.length > 0) {
      console.log('\n   --- Detalles de clicks registrados ---');
      const linkStats = db.prepare(`
        SELECT url, COUNT(*) as count, COUNT(DISTINCT email) as unique_clicks
        FROM click_tracking
        WHERE campaign_id = ?
        GROUP BY url
        ORDER BY count DESC
      `).all(campaignId);

      for (const stat of linkStats) {
        console.log(`   ${stat.url}`);
        console.log(`     - Total clicks: ${stat.count}`);
        console.log(`     - Unique clicks: ${stat.unique_clicks}`);
      }
    }

    // Paso 12: Captura final de stats
    console.log('\n11. Captura de pantalla de stats...');
    await page.goto(`${FRONTEND_URL}/campaigns/${campaignId}/stats`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);
    await page.screenshot({ path: '/tmp/mailux_stats_final.png' });
    console.log('   [OK] Screenshot guardado: /tmp/mailux_stats_final.png');

    // Reporte final
    console.log('\n=== REPORTE FINAL ===');
    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Test Email: ${testEmail}`);
    console.log(`Clicks registrados en BD: ${trackingAfter.length}`);

    if (trackingAfter.length > 0) {
      console.log('\nESTADO: [ÉXITO] Click tracking funciona correctamente');
    } else {
      console.log('\nESTADO: [FALLO] No se registraron clicks en la BD');
    }

    // Mostrar HTML parseado
    console.log('\n=== HTML ENVIADO (primeros 500 caracteres) ===');
    if (campaignSends.length > 0) {
      const htmlSent = campaignSends[0].html || '';
      console.log(htmlSent.substring(0, 500) + '...');
    }

    db.close();

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
