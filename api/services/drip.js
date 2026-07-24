import db from '../db.js';
import { eligibleContacts } from './recipients.js';
import { sendCampaignEmailToContact } from './campaign-send.js';

// Envío por GOTEO (drip): para cada campaña activa con daily_limit, envía como máximo
// daily_limit correos por día a los contactos de su lista que AÚN no recibieron el correo,
// y continúa al día siguiente hasta terminar. Un lote por día por campaña.
//
// - "Ya enviados" se calcula por los registros 'sent' en campaign_sends (fuente de verdad),
//   así el reinicio del servidor no reenvía a quien ya recibió.
// - last_send_date (YYYY-MM-DD) evita mandar dos lotes el mismo día.
// - La fecha es la del servidor en UTC; el contador diario se reinicia a medianoche UTC
//   (7:00 p.m. hora Colombia).
// - Además del límite por campaña, se respeta un TOPE DE CUENTA por día (Brevo = 300):
//   se cuentan TODOS los envíos exitosos del día (cualquier campaña) y nunca se excede
//   DAILY_ACCOUNT_CAP en total, aunque corran varias campañas de goteo a la vez.

// Tope de la cuenta Brevo por día (toda la plataforma comparte una sola cuenta Brevo).
const DAILY_ACCOUNT_CAP = parseInt(process.env.BREVO_DAILY_CAP || '300', 10);

// VENTANA HORARIA: el lote diario solo sale dentro de este rango de hora de Colombia.
// Sin esto, el lote saldría al cambiar el día UTC = 7:00 p.m. en Colombia (mala hora para
// correo comercial). Por defecto arranca a las 7:30 a.m., para que a las 8, cuando el
// cliente abre el correo, esté en las primeras casillas de la bandeja.
// Formato "HH:MM". Se puede cambiar con DRIP_START / DRIP_END, pero OJO: las variables de
// entorno solo se releen al RECREAR el contenedor (docker compose up -d), no con restart.
function aMinutos(hhmm, pordefecto) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return pordefecto;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
const INICIO_MIN = aMinutos(process.env.DRIP_START, 7 * 60 + 30);  // 7:30 a.m.
const FIN_MIN = aMinutos(process.env.DRIP_END, 11 * 60);           // 11:00 a.m.

let running = false;

function todayStr() {
  // YYYY-MM-DD en UTC.
  return new Date().toISOString().slice(0, 10);
}

// Minutos transcurridos del día en Colombia (UTC-5 todo el año: el país no cambia de hora).
function minutosColombia() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function enVentanaDeEnvio(minutos = minutosColombia()) {
  return minutos >= INICIO_MIN && minutos < FIN_MIN;
}

export async function processDripCampaigns() {
  if (running) return; // evita que dos ticks del cron se solapen
  // Fuera de la ventana de la mañana no se envía nada; el cron vuelve a intentar cada minuto
  // y el lote del día sale en cuanto entra la ventana.
  if (!enVentanaDeEnvio()) return;
  running = true;
  try {
    const today = todayStr();
    const campaigns = db.prepare(
      "SELECT * FROM campaigns WHERE status='sending' AND daily_limit IS NOT NULL AND daily_limit > 0"
    ).all();

    for (const c of campaigns) {
      if (c.last_send_date === today) continue; // el lote de hoy ya salió

      // Contactos elegibles de la lista (válidos, no suprimidos, segmento opcional).
      const all = eligibleContacts(c, true);
      // Los que ya recibieron el correo en esta campaña (no reenviar).
      const sentEmails = new Set(
        db.prepare("SELECT email FROM campaign_sends WHERE campaign_id=? AND status='sent'").all(c.id).map(r => r.email)
      );
      const remaining = all.filter(x => !sentEmails.has(x.email));

      // Mantener el total actualizado (audiencia completa elegible).
      db.prepare("UPDATE campaigns SET total=? WHERE id=?").run(all.length, c.id);

      if (remaining.length === 0) {
        db.prepare("UPDATE campaigns SET status='sent', sent_at=datetime('now') WHERE id=?").run(c.id);
        console.log(`[DRIP] Campaña ${c.id} "${c.name}": sin destinatarios pendientes -> COMPLETA`);
        continue;
      }

      // Tope de CUENTA por día: cuenta TODOS los envíos exitosos de hoy (cualquier campaña)
      // y limita este lote a lo que reste para no pasar de DAILY_ACCOUNT_CAP en la cuenta.
      const sentToday = db.prepare("SELECT COUNT(*) n FROM campaign_sends WHERE status='sent' AND date(sent_at)=?").get(today).n;
      const accountRoom = Math.max(0, DAILY_ACCOUNT_CAP - sentToday);
      const todayLimit = Math.min(c.daily_limit, accountRoom);

      // Reclamar el día ANTES de enviar: si el proceso se reinicia a mitad de lote, no se
      // repite el lote hoy (así nunca se excede el tope diario).
      db.prepare("UPDATE campaigns SET last_send_date=? WHERE id=?").run(today, c.id);

      if (todayLimit <= 0) {
        console.log(`[DRIP] Campaña ${c.id} "${c.name}": tope de cuenta ${DAILY_ACCOUNT_CAP}/día ya alcanzado hoy (${sentToday} enviados en la cuenta); espera a mañana`);
        continue;
      }

      const batch = remaining.slice(0, todayLimit);
      let sent = 0, failed = 0;

      for (const contact of batch) {
        // Permite pausar a mitad del lote: si dejó de estar 'sending', se detiene.
        const cur = db.prepare("SELECT status FROM campaigns WHERE id=?").get(c.id);
        if (!cur || cur.status !== 'sending') break;
        try {
          const html = await sendCampaignEmailToContact(c, contact);
          db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, sent_at, html) VALUES (?,?,?,'sent',datetime('now'),?)")
            .run(c.id, contact.email, contact.name, html);
          sent++;
        } catch (err) {
          db.prepare("INSERT INTO campaign_sends (campaign_id, email, name, status, error) VALUES (?,?,?,'failed',?)")
            .run(c.id, contact.email, contact.name, err.message);
          failed++;
        }
      }

      // Acumular contadores (last_send_date ya se marcó arriba).
      const totalSent = sentEmails.size + sent;
      db.prepare("UPDATE campaigns SET sent=?, failed=failed+? WHERE id=?")
        .run(totalSent, failed, c.id);

      // ¿Fue el último lote? (no quedan más pendientes tras enviar este)
      const stillPending = remaining.length - sent;
      if (stillPending <= 0) {
        db.prepare("UPDATE campaigns SET status='sent', sent_at=datetime('now') WHERE id=?").run(c.id);
        console.log(`[DRIP] Campaña ${c.id} "${c.name}": lote ${sent} enviados (${totalSent}/${all.length}), ${failed} fallidos -> COMPLETA`);
      } else {
        console.log(`[DRIP] Campaña ${c.id} "${c.name}": lote ${sent} enviados (${totalSent}/${all.length}), ${failed} fallidos -> continúa mañana (${stillPending} pendientes)`);
      }
    }
  } catch (e) {
    console.error('[DRIP ERROR]', e.message);
  } finally {
    running = false;
  }
}
