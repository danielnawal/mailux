import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Proveedor de envío seleccionable con EMAIL_PROVIDER:
//   - "brevo" -> envía por SMTP de Brevo (nodemailer)
//   - cualquier otro valor / ausente -> envía por Amazon SES (comportamiento previo)
// Se mantienen AMBAS vías para poder volver a SES con un solo cambio de variable
// si AWS aprueba el acceso de producción.
// ---------------------------------------------------------------------------
const PROVIDER = (process.env.EMAIL_PROVIDER || 'ses').toLowerCase();

// ---- Amazon SES (vía original, intacta) -----------------------------------
let sesClient = null;

export function configureSES(accessKeyId, secretAccessKey, region = 'us-east-1') {
  sesClient = new SESClient({ region, credentials: { accessKeyId, secretAccessKey } });
}

// Auto-configurar desde variables de entorno si están disponibles
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  configureSES(process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_REGION || 'us-east-1');
}

// ---- Brevo SMTP (nueva vía) ------------------------------------------------
let brevoTransport = null;

function getBrevoTransport() {
  if (brevoTransport) return brevoTransport;
  const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;
  if (!user || !pass) {
    throw new Error('EMAIL_PROVIDER=brevo pero faltan BREVO_SMTP_USER / BREVO_SMTP_KEY');
  }
  brevoTransport = nodemailer.createTransport({
    host,
    port,
    secure: false, // 587 usa STARTTLS
    auth: { user, pass }
  });
  return brevoTransport;
}

// ---- Interfaz única de envío (misma firma para todos los llamadores) -------
export async function sendEmail({ from, fromName, to, subject, html }) {
  if (PROVIDER === 'brevo') {
    const t = getBrevoTransport();
    const info = await t.sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject,
      html
    });
    return { success: true, messageId: info.messageId, provider: 'brevo' };
  }

  // --- Amazon SES (comportamiento previo) ---
  if (!sesClient) {
    // Modo sandbox: simula envío hasta que se configuren credenciales AWS
    console.log(`[SES SANDBOX] Para: ${to} | Asunto: ${subject}`);
    return { success: true, sandbox: true };
  }

  const cmd = new SendEmailCommand({
    Source: `${fromName} <${from}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } }
    }
  });

  const result = await sesClient.send(cmd);
  return { success: true, messageId: result.MessageId, provider: 'ses' };
}
