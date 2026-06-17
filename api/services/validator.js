// Validación de correos ANTES de enviar, para bajar el bounce rate y evitar
// sanciones de AWS SES. Hace 3 cosas, todas gratis y SIN tocar el servidor del
// destinatario (cero riesgo de reputación de IP):
//   1) Sintaxis (formato del correo).
//   2) Dominio desechable (lista de descarte conocida).
//   3) DNS del dominio: ¿tiene servidor de correo (MX) o al menos registro A?
//
// LÍMITE HONESTO: esto verifica que el DOMINIO pueda recibir correo, no que el
// BUZÓN exacto exista. Un dominio typosquatting con MX real (p.ej. hotmial.com)
// pasa como válido. Verificar el buzón exacto de forma fiable requiere un
// servicio pagado (ZeroBounce/NeverBounce) o el feedback de rebote del propio SES.
//
// Resultado por correo: { result, reason }
//   result = 'valid'   -> dominio con MX. Se envía.
//   result = 'risky'   -> desechable, sin MX (solo A), o DNS sin respuesta. Se
//                         marca pero NO se excluye solo: el usuario decide.
//   result = 'invalid' -> formato malo o dominio inexistente. SE EXCLUYE del envío.

import dns from 'dns';
const resolveMx = dns.promises.resolveMx;
const resolve4 = dns.promises.resolve4;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dominios desechables/temporales comunes (no exhaustivo).
const DISPOSABLE = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'getnada.com',
  'trashmail.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'mohmal.com',
  'spamgourmet.com', 'tempinbox.com', 'emailondeck.com', 'mailcatch.com',
  'tempr.email', 'discard.email', 'mailsac.com', 'tempmailo.com',
  'guerrillamail.info', 'grr.la', 'spam4.me', 'trbvm.com', 'mailtemp.net'
]);

// Caché por dominio para no repetir DNS (la mayoría de contactos comparten pocos dominios).
const domainCache = new Map(); // domain -> { status, ts }
const TTL = 1000 * 60 * 60 * 6; // 6 horas

export function checkSyntax(email) {
  if (!email || email.length > 254) return false;
  if (!emailRegex.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('-') || domain.endsWith('-') || domain.includes('..')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

// Estado DNS del dominio: 'mx' | 'a_only' | 'none' | 'unknown'
async function resolveDomainStatus(domain) {
  // MX con un reintento ante fallo transitorio (ESERVFAIL/ETIMEOUT).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const mx = await resolveMx(domain);
      if (Array.isArray(mx) && mx.some(r => r.exchange)) return 'mx';
      break; // respuesta vacía -> sin MX, pasar a comprobar A
    } catch (e) {
      if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') break; // sin MX definitivo
      if (attempt === 0) continue; // transitorio: reintenta una vez
      break; // segundo fallo: pasar a comprobar A
    }
  }
  // Sin MX: ¿al menos hay registro A? (RFC 5321: A actúa como ruta de correo implícita)
  try {
    const a = await resolve4(domain);
    if (Array.isArray(a) && a.length) return 'a_only';
    return 'none';
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') return 'none';
    return 'unknown'; // DNS no responde en ambos -> no verificable
  }
}

async function lookupDomain(domain) {
  const cached = domainCache.get(domain);
  if (cached && (Date.now() - cached.ts) < TTL) return cached.status;
  const status = await resolveDomainStatus(domain);
  domainCache.set(domain, { status, ts: Date.now() });
  return status;
}

export async function validateEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!checkSyntax(e)) return { result: 'invalid', reason: 'formato inválido' };
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) return { result: 'risky', reason: 'dominio desechable' };
  const status = await lookupDomain(domain);
  if (status === 'mx') return { result: 'valid', reason: 'ok' };
  if (status === 'a_only') return { result: 'risky', reason: 'dominio sin servidor MX (entrega incierta)' };
  if (status === 'unknown') return { result: 'risky', reason: 'DNS no responde (no verificable)' };
  return { result: 'invalid', reason: 'dominio inexistente' };
}

// Valida muchos con concurrencia limitada (la caché por dominio lo hace rápido).
export async function validateMany(emails, concurrency = 10) {
  const out = new Array(emails.length);
  let i = 0;
  async function worker() {
    while (i < emails.length) {
      const idx = i++;
      out[idx] = await validateEmail(emails[idx]);
    }
  }
  const n = Math.min(concurrency, emails.length || 1);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
