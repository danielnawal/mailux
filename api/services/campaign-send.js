import db from '../db.js';
import { sendEmail } from './ses.js';
import { personalize } from './personalize.js';

const MAILUX_BASE_URL = process.env.MAILUX_BASE_URL || 'https://mailux.gpssoftwarenumberone.com';

// Reemplaza todos los <a href="..."> por una URL de tracking de clicks (misma lógica
// que usaba routes/campaigns.js; se centraliza aquí para reusarla en envío normal y goteo).
export function replaceLinksWithTracking(html, campaignId, email) {
  const encodedEmail = encodeURIComponent(email);
  const linkRegex = /<a\s+([^>]*?\s)?href=["']([^"']+)["']([^>]*)>/gi;
  return html.replace(linkRegex, (match, before, url, after) => {
    const beforePart = before || '';
    const afterPart = after || '';
    const encodedUrl = encodeURIComponent(url);
    // URL ABSOLUTA: dentro de un correo no existe página base, así que un enlace relativo
    // queda muerto en Gmail/Outlook. Mismo criterio que el píxel y el enlace de baja.
    const trackingUrl = `${MAILUX_BASE_URL}/api/campaigns/${campaignId}/track-click?url=${encodedUrl}&email=${encodedEmail}`;
    return `<a ${beforePart}href="${trackingUrl}"${afterPart}>`;
  });
}

// Construye el HTML final (personalización + tracking de clicks + enlace de baja + píxel de
// apertura) y envía el correo a un contacto. Devuelve el HTML enviado para guardarlo en
// campaign_sends. NO escribe en la base: eso lo hace el llamador (envío normal o goteo).
// El contacto debe traer: email, name, attributes, unsubscribe_token.
export async function sendCampaignEmailToContact(campaign, contact) {
  const encodedEmail = encodeURIComponent(contact.email);
  const trackingPixel = `<img src="${MAILUX_BASE_URL}/api/campaigns/${campaign.id}/pixel.gif?email=${encodedEmail}" width="1" height="1" style="display:none;" alt="">`;

  let html = personalize(campaign.body_html, contact);
  html = replaceLinksWithTracking(html, campaign.id, contact.email);

  const unsubscribeLink = `<a href="${MAILUX_BASE_URL}/api/campaigns/${campaign.id}/unsubscribe?token=${contact.unsubscribe_token}" style="color: #999; font-size: 12px; text-decoration: none;">Unsubscribe</a>`;
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
    html
  });
  return html;
}
