import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { sendEmail } from './services/ses.js';
import { detectBounceSpikesByCampaign } from './services/bounce-handler.js';
import { eligibleContacts } from './services/recipients.js';
import { personalize } from './services/personalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAILUX_BASE_URL = process.env.MAILUX_BASE_URL || 'https://mailux.gpssoftwarenumberone.com';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes desde esta IP, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Demasiadas solicitudes en endpoints públicos',
});

app.use('/api/', limiter);
app.use('/webhooks/', strictLimiter);

import authRouter from './routes/auth.js';
import listsRouter from './routes/lists.js';
import campaignsRouter from './routes/campaigns.js';
import statsRouter from './routes/stats.js';
import webhooksRouter from './routes/webhooks.js';
import uploadsRouter from './routes/uploads.js';
import { landingManage, landingPublic, landingCapture } from './routes/landing.js';

app.use('/api/auth', authRouter);
app.use('/api/lists', listsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/landing', landingManage);
app.use('/api/public', landingCapture);
app.use('/p', landingPublic);
app.use('/webhooks', webhooksRouter);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Cron job para ejecutar campañas programadas
async function checkScheduledCampaigns() {
  const now = new Date().toISOString();
  const scheduled = db.prepare("SELECT id FROM campaigns WHERE status='scheduled' AND scheduled_at <= ?").all(now);
  for (const campaign of scheduled) {
    const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id);
    const contacts = eligibleContacts(c, false);
    if (contacts.length) {
      db.prepare("UPDATE campaigns SET status='sending', total=? WHERE id=?").run(contacts.length, c.id);
      let sent = 0, failed = 0;
      for (const contact of contacts) {
        try {
          await sendEmail({
            from: c.from_email,
            fromName: c.from_name,
            to: contact.email,
            subject: c.subject,
            html: personalize(c.body_html, contact)
          });
          db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, sent_at) VALUES (?,?,?,'sent',datetime('now'))").run(c.id, contact.email, contact.name);
          sent++;
        } catch (err) {
          db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, error) VALUES (?,?,?,'failed',?)").run(c.id, contact.email, contact.name, err.message);
          failed++;
        }
      }
      db.prepare("UPDATE campaigns SET status='sent', sent=?, failed=?, sent_at=datetime('now') WHERE id=?").run(sent, failed, c.id);
    }
  }
}

setInterval(checkScheduledCampaigns, 60000);

// Cron job para detectar bounce spikes (cada hora)
function checkBounceSpikes() {
  try {
    const warnings = detectBounceSpikesByCampaign();
    if (warnings.length > 0) {
      console.warn(`[BOUNCE SPIKE DETECTION] ${warnings.length} campaign(s) with high bounce rate:`);
      warnings.forEach(w => {
        console.warn(`  - Campaign "${w.campaignName}" (ID: ${w.campaignId}): ${w.hardBounceCount} hard bounces (${w.bounceRate}) [${w.severity}]`);
      });
    }
  } catch (err) {
    console.error('[BOUNCE SPIKE CHECK ERROR]', err.message);
  }
}

setInterval(checkBounceSpikes, 3600000); // Ejecutar cada hora

const PORT = process.env.PORT || 4600;
app.listen(PORT, () => console.log(`Mailux API corriendo en puerto ${PORT}`));
