import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCampaignBounceStats } from '../services/bounce-handler.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const did = req.user.distributor_id;
  const total_lists = db.prepare('SELECT COUNT(*) as n FROM contact_lists WHERE distributor_id=?').get(did).n;
  const total_contacts = db.prepare('SELECT COUNT(*) as n FROM contacts c JOIN contact_lists cl ON cl.id=c.list_id WHERE cl.distributor_id=?').get(did).n;
  const total_campaigns = db.prepare("SELECT COUNT(*) as n FROM campaigns WHERE distributor_id=?").get(did).n;
  const sent_campaigns = db.prepare("SELECT COUNT(*) as n FROM campaigns WHERE distributor_id=? AND status='sent'").get(did).n;
  const total_sent = db.prepare("SELECT COALESCE(SUM(sent),0) as n FROM campaigns WHERE distributor_id=?").get(did).n;

  // Bounce stats globales
  const bounce_stats = db.prepare(`
    SELECT
      SUM(CASE WHEN bounce_status = 'hard' THEN 1 ELSE 0 END) as hard_bounces,
      SUM(CASE WHEN bounce_status = 'soft' THEN 1 ELSE 0 END) as soft_bounces
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE c.distributor_id = ?
  `).get(did);

  const suppressed = db.prepare('SELECT COUNT(*) as n FROM suppression').get().n;

  const recent = db.prepare("SELECT name, subject, sent, failed, sent_at FROM campaigns WHERE distributor_id=? AND status='sent' ORDER BY sent_at DESC LIMIT 5").all(did);
  res.json({
    total_lists,
    total_contacts,
    total_campaigns,
    sent_campaigns,
    total_sent,
    suppressed,
    bounce_stats: {
      hard_bounces: bounce_stats.hard_bounces || 0,
      soft_bounces: bounce_stats.soft_bounces || 0
    },
    recent
  });
});

export default router;
