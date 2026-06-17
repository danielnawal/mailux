import { Router } from 'express';
import db from '../db.js';
import { handleSESBounce, handleSESComplaint } from '../services/bounce-handler.js';

const router = Router();

// Validación básica de origen SNS
function validateSNSMessage(req) {
  // Verificar que el mensaje tiene la estructura SNS requerida
  const { Message, MessageId, Type, Timestamp, SigningCertURL, Signature } = req.body;

  // Si no tiene estos campos, no es un mensaje SNS válido
  if (!Message || !MessageId || !Type || !Timestamp || !Signature) {
    return { valid: false, reason: 'Missing required SNS fields' };
  }

  // Para protección adicional, se debería verificar la firma contra cert de AWS
  // Por ahora, verificamos que la firma existe (al menos es un intento)
  // TODO: Implementar validación de firma completa usando AWS cert public key

  return { valid: true };
}

/**
 * POST /webhooks/ses-bounce
 * Recibe notificaciones de bounce de SNS (sin autenticación requerida)
 * SNS envía un JSON con la estructura de bounce
 */
router.post('/ses-bounce', async (req, res) => {
  try {
    // Validar que el mensaje viene de SNS
    const validation = validateSNSMessage(req);
    if (!validation.valid) {
      console.warn(`[SNS VALIDATION FAILED] ${validation.reason}`);
      return res.status(401).json({ error: 'Invalid SNS message origin' });
    }

    const { Message, MessageId, Type, TopicArn, SubscribeURL } = req.body;

    // Confirmar la suscripción SNS de verdad: hay que visitar el SubscribeURL.
    if (Type === 'SubscriptionConfirmation') {
      console.log(`[SNS SUBSCRIBE] Confirmando suscripción de ${TopicArn}`);
      if (SubscribeURL) {
        try { await fetch(SubscribeURL); console.log('[SNS SUBSCRIBE] Confirmada'); }
        catch (e) { console.error('[SNS SUBSCRIBE] Error al confirmar:', e.message); }
      }
      return res.json({ ok: true, message: 'Subscription confirmation received' });
    }

    // Parsear el mensaje (viene como string JSON)
    let data;
    try {
      data = typeof Message === 'string' ? JSON.parse(Message) : Message;
    } catch (e) {
      console.error('[SNS] Failed to parse Message:', e.message);
      return res.status(400).json({ error: 'Invalid message format' });
    }

    // SES marca el tipo en notificationType (Bounce | Complaint | Delivery)
    const ntype = data.notificationType || (data.bounce ? 'Bounce' : data.complaint ? 'Complaint' : null);

    if (ntype === 'Complaint' && data.complaint) {
      const result = handleSESComplaint(data.complaint.complainedRecipients || []);
      console.log(`[COMPLAINT PROCESSED] Recipients: ${result.totalProcessed}, SNS MessageId: ${MessageId}`);
      return res.json({ ok: true, ...result, snsMessageId: MessageId });
    }

    if (ntype === 'Bounce' && data.bounce) {
      const { bounceType, bouncedRecipients } = data.bounce;
      if (!bounceType || !bouncedRecipients) return res.status(400).json({ error: 'Missing bounce type or recipients' });
      const result = handleSESBounce(bounceType, bouncedRecipients);
      console.log(`[BOUNCE PROCESSED] Type: ${bounceType}, Recipients: ${bouncedRecipients.length}, SNS MessageId: ${MessageId}`);
      return res.json({ ok: true, ...result, snsMessageId: MessageId });
    }

    // Otros (Delivery, etc.) se ignoran sin error.
    return res.json({ ok: true, processed: 0, ignored: ntype || 'unknown' });
  } catch (err) {
    console.error('[BOUNCE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
