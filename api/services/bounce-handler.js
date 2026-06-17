import db from '../db.js';
import { suppress } from './suppression.js';

/**
 * Maneja notificaciones de bounce de SES via SNS
 * @param {string} bounceType - 'Permanent' o 'Temporary'
 * @param {Array} bouncedRecipients - [{emailAddress, status}]
 * @returns {Object} resultado del procesamiento
 */
export function handleSESBounce(bounceType, bouncedRecipients) {
  if (!bounceType || !Array.isArray(bouncedRecipients)) {
    throw new Error('Bounce data inválido');
  }

  const results = [];

  for (const recipient of bouncedRecipients) {
    const { emailAddress, status } = recipient;
    if (!emailAddress) continue;

    const bounceStatusValue = bounceType === 'Permanent' ? 'hard' : 'soft';

    try {
      // Encontrar all campaign_sends para este email
      const sends = db.prepare(`
        SELECT cs.id, cs.campaign_id, c.distributor_id
        FROM campaign_sends cs
        JOIN campaigns c ON c.id = cs.campaign_id
        WHERE cs.email = ? AND cs.status = 'sent'
      `).all(emailAddress);

      for (const send of sends) {
        db.prepare(`
          UPDATE campaign_sends
          SET bounce_status = ?, status = 'bounced'
          WHERE id = ?
        `).run(bounceStatusValue, send.id);
      }

      // Si es hard bounce, suprimir SIEMPRE (haya o no envíos previos registrados).
      if (bounceStatusValue === 'hard') {
        suppress(emailAddress, 'bounce');
      }

      results.push({
        email: emailAddress,
        bounceType,
        bounceStatus: bounceStatusValue,
        status: 'processed',
        sendsUpdated: sends.length
      });
    } catch (err) {
      results.push({
        email: emailAddress,
        error: err.message,
        status: 'failed'
      });
    }
  }

  return {
    totalProcessed: results.length,
    results
  };
}

/**
 * Maneja notificaciones de QUEJA (complaint) de SES via SNS.
 * Una queja (marcar como spam) es más grave que un rebote: hay que suprimir SIEMPRE.
 */
export function handleSESComplaint(complainedRecipients) {
  if (!Array.isArray(complainedRecipients)) throw new Error('Complaint data inválido');
  const results = [];
  for (const recipient of complainedRecipients) {
    const email = recipient && recipient.emailAddress;
    if (!email) continue;
    try {
      // Marcar los envíos como bounced/queja y suprimir el correo.
      db.prepare("UPDATE campaign_sends SET bounce_status='hard', status='bounced' WHERE email = ? AND status='sent'").run(email);
      suppress(email, 'complaint');
      results.push({ email, status: 'processed', type: 'complaint' });
    } catch (err) {
      results.push({ email, status: 'failed', error: err.message });
    }
  }
  return { totalProcessed: results.length, results };
}

/**
 * Detecta bounce spikes (cron job - ejecutar cada hora)
 * @returns {Object} warning si detecta anomalía
 */
export function detectBounceSpikesByCampaign() {
  const warnings = [];

  // Contar hard bounces por campaña (últimas 24 horas)
  const spikes = db.prepare(`
    SELECT
      cs.campaign_id,
      c.name,
      c.distributor_id,
      COUNT(*) as hard_bounce_count,
      (SELECT COUNT(*) FROM campaign_sends WHERE campaign_id = cs.campaign_id AND status = 'sent') as total_sent
    FROM campaign_sends cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE cs.bounce_status = 'hard'
      AND cs.sent_at >= datetime('now', '-24 hours')
    GROUP BY cs.campaign_id, c.distributor_id
    HAVING hard_bounce_count > 5
  `).all();

  for (const spike of spikes) {
    const bounceRate = spike.total_sent > 0
      ? ((spike.hard_bounce_count / spike.total_sent) * 100).toFixed(2)
      : 0;

    warnings.push({
      campaignId: spike.campaign_id,
      campaignName: spike.name,
      distributorId: spike.distributor_id,
      hardBounceCount: spike.hard_bounce_count,
      bounceRate: `${bounceRate}%`,
      severity: bounceRate > 10 ? 'HIGH' : 'MEDIUM'
    });

    // Auto-pause si bounce rate > 10%
    if (bounceRate > 10) {
      db.prepare(`
        UPDATE campaigns
        SET status = 'paused'
        WHERE id = ? AND status IN ('sending', 'scheduled')
      `).run(spike.campaign_id);

      console.warn(`[BOUNCE SPIKE] Campaign ${spike.campaign_id} paused (${bounceRate}% hard bounces)`);
    }
  }

  return warnings;
}

/**
 * Obtiene estadísticas de bounces para una campaña
 */
export function getCampaignBounceStats(campaignId) {
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN bounce_status = 'hard' THEN 1 ELSE 0 END) as hard_bounces,
      SUM(CASE WHEN bounce_status = 'soft' THEN 1 ELSE 0 END) as soft_bounces,
      COUNT(*) as total_bounced
    FROM campaign_sends
    WHERE campaign_id = ? AND bounce_status IS NOT NULL
  `).get(campaignId);

  return {
    hardBounces: stats.hard_bounces || 0,
    softBounces: stats.soft_bounces || 0,
    totalBounced: stats.total_bounced || 0
  };
}
