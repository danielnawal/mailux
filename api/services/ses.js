import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let sesClient = null;

export function configureSES(accessKeyId, secretAccessKey, region = 'us-east-1') {
  sesClient = new SESClient({ region, credentials: { accessKeyId, secretAccessKey } });
}

// Auto-configurar desde variables de entorno si están disponibles
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  configureSES(process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_REGION || 'us-east-1');
}

export async function sendEmail({ from, fromName, to, subject, html }) {
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
  return { success: true, messageId: result.MessageId };
}
