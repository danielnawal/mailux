import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../services/ses.js';
import { getCampaignBounceStats } from '../services/bounce-handler.js';
import { suppress } from '../services/suppression.js';
import { eligibleContacts } from '../services/recipients.js';
import { personalize } from '../services/personalize.js';
import { readFileSync } from 'fs';

const MAILUX_BASE_URL = process.env.MAILUX_BASE_URL || 'https://mailux.gpssoftwarenumberone.com';

const router = Router();

// Public endpoints (SIN autenticación)
// Pixel tracking
router.get('/:id/pixel.gif', (req, res) => {
  const { email } = req.query;
  if (!email) {
    res.setHeader('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    return;
  }
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
  if (campaign) {
    db.prepare('INSERT OR IGNORE INTO campaign_opens (campaign_id, email, user_agent, ip_address) VALUES (?,?,?,?)').run(
      req.params.id,
      email,
      req.headers['user-agent'] || '',
      req.ip || ''
    );
    db.prepare("UPDATE campaign_sends SET opened_at=datetime('now') WHERE campaign_id = ? AND email = ? AND opened_at IS NULL").run(req.params.id, email);
  }
  res.setHeader('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

// Click tracking
router.get('/:id/track-click', (req, res) => {
  const { url, email } = req.query;

  if (!url || !email) {
    return res.status(400).json({ error: 'URL y email son requeridos' });
  }

  try {
    // Decodificar URL original
    const decodedUrl = decodeURIComponent(url);
    const decodedEmail = decodeURIComponent(email);

    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
    if (campaign) {
      // Insertar en click_tracking
      db.prepare(`
        INSERT INTO click_tracking (campaign_id, email, url, ip, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.params.id,
        decodedEmail,
        decodedUrl,
        req.ip || '',
        req.headers['user-agent'] || ''
      );
    }

    // Redirect a la URL original con código 302
    res.redirect(302, decodedUrl);
  } catch (err) {
    console.error('Error en track-click:', err);
    res.status(500).json({ error: 'Error al procesar el click' });
  }
});

// Unsubscribe endpoint (público)
router.get('/:id/unsubscribe', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<html><body><h1>Error</h1><p>Token inválido o no proporcionado</p></body></html>');
  }

  const contact = db.prepare('SELECT id, email FROM contacts WHERE unsubscribe_token = ?').get(token);
  if (!contact) {
    return res.status(404).send('<html><body><h1>Error</h1><p>Token no válido</p></body></html>');
  }

  // Mark as unsubscribed + suprimir globalmente (no recibirá más, en ninguna lista)
  db.prepare("UPDATE contacts SET status = 'unsubscribed' WHERE id = ?").run(contact.id);
  suppress(contact.email, 'unsubscribe');

  // Return success page
  const successHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Desuscrito</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; font-size: 16px; line-height: 1.6; }
        .checkmark { font-size: 60px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="checkmark">✓</div>
        <h1>Desuscrito correctamente</h1>
        <p>Ha sido removido de nuestras listas de correo. No recibirá más mensajes de nuestra parte.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">Si esto fue un error, contacte con nuestro equipo de soporte.</p>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(successHtml);
});

// GET templates (sin autenticación)
router.get('/templates/list', (req, res) => {
  const templates = db.prepare('SELECT id, name, description FROM templates ORDER BY name ASC').all();
  res.json(templates);
});

router.get('/templates/:id', (req, res) => {
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(template);
});

// Middleware de autenticación para todo lo demás
router.use(requireAuth);

// Enviar un correo de PRUEBA a una sola dirección, para revisar el diseño antes de la campaña real.
// En sandbox de AWS solo llega si 'to' es una identidad verificada.
router.post('/test-send', async (req, res) => {
  const { to, from_name, from_email, subject, body_html } = req.body || {};
  if (!to || !from_email || !subject || !body_html) return res.status(400).json({ error: 'Faltan datos: destinatario, remitente, asunto o contenido.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'El correo de prueba no es válido.' });
  try {
    let html = String(body_html).replace(/{{nombre}}/gi, 'Prueba');
    html = html.replace(/{{unsubscribe_link}}/gi, '<a href="#" style="color:#999;font-size:12px;text-decoration:none;">Cancelar suscripción</a>');
    await sendEmail({ from: from_email, fromName: from_name || 'Mailux', to, subject: '[PRUEBA] ' + subject, html });
    res.json({ ok: true, message: `Correo de prueba enviado a ${to}` });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo enviar: ' + err.message });
  }
});

router.get('/', (req, res) => {
  const campaigns = db.prepare(`
    SELECT c.*, cl.name as list_name
    FROM campaigns c
    LEFT JOIN contact_lists cl ON cl.id = c.list_id
    WHERE c.distributor_id = ?
    ORDER BY c.created_at DESC
  `).all(req.user.distributor_id);
  res.json(campaigns);
});

router.post('/', (req, res) => {
  const { name, subject, from_name, from_email, body_html, list_id } = req.body;
  if (!name || !subject || !from_name || !from_email || !body_html) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  if (list_id) {
    const list = db.prepare('SELECT id FROM contact_lists WHERE id = ? AND distributor_id = ?').get(list_id, req.user.distributor_id);
    if (!list) return res.status(400).json({ error: 'Lista inválida' });
  }
  const segKey = (req.body.segment_key || '').trim() || null;
  const segVal = (req.body.segment_value || '').trim() || null;
  const result = db.prepare(`
    INSERT INTO campaigns (distributor_id, list_id, name, subject, from_name, from_email, body_html, segment_key, segment_value)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(req.user.distributor_id, list_id || null, name, subject, from_name, from_email, body_html, segKey, segVal);
  res.json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const campaign = db.prepare(`
    SELECT c.*, cl.name as list_name
    FROM campaigns c LEFT JOIN contact_lists cl ON cl.id = c.list_id
    WHERE c.id = ? AND c.distributor_id = ?
  `).get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json(campaign);
});

router.put('/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden editar borradores' });

  const { name, subject, from_name, from_email, body_html, list_id } = req.body;
  if (!name || !subject || !from_name || !from_email || !body_html) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const segKey = (req.body.segment_key || '').trim() || null;
  const segVal = (req.body.segment_value || '').trim() || null;
  db.prepare(`
    UPDATE campaigns SET name=?, subject=?, from_name=?, from_email=?, body_html=?, list_id=?, segment_key=?, segment_value=?
    WHERE id=?
  `).run(name, subject, from_name, from_email, body_html, list_id || null, segKey, segVal, campaign.id);

  res.json({ ok: true, message: 'Campaña actualizada' });
});

function replaceLinksWithTracking(html, campaignId, email) {
  // Parsear todos los <a href="..."> y reemplazar con tracking URLs
  const encodedEmail = encodeURIComponent(email);

  // Regex para encontrar <a href="...">
  const linkRegex = /<a\s+([^>]*?\s)?href=["']([^"']+)["']([^>]*)>/gi;

  let modifiedHtml = html;
  modifiedHtml = modifiedHtml.replace(linkRegex, (match, before, url, after) => {
    // Preservar atributos antes y después de href
    const beforePart = before || '';
    const afterPart = after || '';

    // Codificar la URL original
    const encodedUrl = encodeURIComponent(url);

    // Crear URL de tracking
    const trackingUrl = `/api/campaigns/${campaignId}/track-click?url=${encodedUrl}&email=${encodedEmail}`;

    return `<a ${beforePart}href="${trackingUrl}"${afterPart}>`;
  });

  return modifiedHtml;
}

async function executeCampaignSend(campaignId) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign || campaign.status === 'sent') return;

  // Destinatarios elegibles: válidos, no suprimidos, segmento opcional (ver recipients.js).
  const contacts = eligibleContacts(campaign, true);
  if (!contacts.length) {
    db.prepare("UPDATE campaigns SET status='failed' WHERE id=?").run(campaignId);
    return;
  }

  db.prepare("UPDATE campaigns SET status='sending', total=? WHERE id=?").run(contacts.length, campaignId);

  let sent = 0, failed = 0;
  for (const contact of contacts) {
    try {
      const encodedEmail = encodeURIComponent(contact.email);
      const trackingPixel = `<img src="${MAILUX_BASE_URL}/api/campaigns/${campaignId}/pixel.gif?email=${encodedEmail}" width="1" height="1" style="display:none;" alt="">`;

      let html = personalize(campaign.body_html, contact);

      // Reemplazar links con tracking URLs
      html = replaceLinksWithTracking(html, campaignId, contact.email);

      // Generate unsubscribe link
      const unsubscribeLink = `<a href="https://mailux.gpssoftwarenumberone.com/api/campaigns/${campaignId}/unsubscribe?token=${contact.unsubscribe_token}" style="color: #999; font-size: 12px; text-decoration: none;">Unsubscribe</a>`;

      // Replace {{unsubscribe_link}} or add at the bottom if not present
      if (html.includes('{{unsubscribe_link}}')) {
        html = html.replace(/{{unsubscribe_link}}/gi, unsubscribeLink);
      } else {
        html = html + `<hr style="border: none; border-top: 1px solid #eee; margin-top: 40px;"><div style="text-align: center; padding: 20px; font-size: 12px; color: #999;">${unsubscribeLink}</div>`;
      }

      html = html + trackingPixel;

      await sendEmail({
        from: campaign.from_email,
        fromName: campaign.from_name,
        to: contact.email,
        subject: campaign.subject,
        html: html
      });
      db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, sent_at, html) VALUES (?,?,?,'sent',datetime('now'),?)").run(campaignId, contact.email, contact.name, html);
      sent++;
    } catch (err) {
      db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, error) VALUES (?,?,?,'failed',?)").run(campaignId, contact.email, contact.name, err.message);
      failed++;
    }
  }
  db.prepare("UPDATE campaigns SET status='sent', sent=?, failed=?, sent_at=datetime('now') WHERE id=?").run(sent, failed, campaignId);
}

router.post('/:id/send', async (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status === 'sent') return res.status(400).json({ error: 'Esta campaña ya fue enviada' });
  if (!campaign.list_id) return res.status(400).json({ error: 'Selecciona una lista antes de enviar' });

  const contacts = eligibleContacts(campaign, false);
  if (!contacts.length) return res.status(400).json({ error: 'La lista no tiene contactos válidos para enviar' });

  res.json({ ok: true, total: contacts.length, message: 'Envío iniciado' });
  executeCampaignSend(campaign.id);
});

router.post('/:id/schedule', (req, res) => {
  const { scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'Fecha y hora requeridas' });

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden programar borradores' });
  if (!campaign.list_id) return res.status(400).json({ error: 'Selecciona una lista antes de programar' });

  const now = new Date();
  const scheduledDate = new Date(scheduled_at);
  if (scheduledDate <= now) return res.status(400).json({ error: 'La fecha debe ser en el futuro' });

  db.prepare("UPDATE campaigns SET status='scheduled', scheduled_at=? WHERE id=?").run(scheduled_at, campaign.id);
  res.json({ ok: true, scheduled_at, message: `Programado para ${new Date(scheduled_at).toLocaleString()}` });
});

router.delete('/:id/schedule', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status !== 'scheduled') return res.status(400).json({ error: 'Esta campaña no está programada' });

  db.prepare("UPDATE campaigns SET status='draft', scheduled_at=NULL WHERE id=?").run(campaign.id);
  res.json({ ok: true, message: 'Programación cancelada' });
});

router.post('/:id/duplicate', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

  const newName = `${campaign.name} (Copia)`;
  const result = db.prepare(`
    INSERT INTO campaigns (distributor_id, list_id, name, subject, from_name, from_email, body_html)
    VALUES (?,?,?,?,?,?,?)
  `).run(campaign.distributor_id, campaign.list_id, newName, campaign.subject, campaign.from_name, campaign.from_email, campaign.body_html);

  res.json({ id: result.lastInsertRowid, name: newName });
});

router.patch('/:id/pause', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status !== 'sending') return res.status(400).json({ error: 'Solo se pueden pausar campañas en envío' });

  db.prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(campaign.id);
  res.json({ ok: true, message: 'Campaña pausada' });
});

router.patch('/:id/resume', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status !== 'paused') return res.status(400).json({ error: 'Esta campaña no está pausada' });

  db.prepare("UPDATE campaigns SET status='sending' WHERE id=?").run(campaign.id);
  res.json({ ok: true, message: 'Envío reanudado' });
});

router.get('/:id/stats', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND distributor_id = ?').get(req.params.id, req.user.distributor_id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  const sends = db.prepare('SELECT status, COUNT(*) as n FROM campaign_sends WHERE campaign_id = ? GROUP BY status').all(campaign.id);
  const byStatus = Object.fromEntries(sends.map(r => [r.status, r.n]));
  const opens = db.prepare('SELECT COUNT(DISTINCT email) as opened FROM campaign_opens WHERE campaign_id = ?').get(campaign.id);

  // Click tracking stats
  const clickCount = db.prepare('SELECT COUNT(DISTINCT email) as clicked FROM click_tracking WHERE campaign_id = ?').get(campaign.id);
  const linkStats = db.prepare(`
    SELECT url, COUNT(*) as count, COUNT(DISTINCT email) as unique_clicks
    FROM click_tracking
    WHERE campaign_id = ?
    GROUP BY url
    ORDER BY count DESC
  `).all(campaign.id);

  res.json({
    ...campaign,
    by_status: byStatus,
    opened: opens.opened || 0,
    clicked: clickCount.clicked || 0,
    link_stats: linkStats
  });
});

export default router;
