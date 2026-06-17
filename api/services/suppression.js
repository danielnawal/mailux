import db from '../db.js';

// Agrega un correo a la supresión global (idempotente). reason: bounce | complaint | unsubscribe
export function suppress(email, reason) {
  if (!email) return;
  const e = String(email).trim().toLowerCase();
  db.prepare('INSERT OR IGNORE INTO suppression (email, reason) VALUES (?,?)').run(e, reason || 'manual');
  // Marca también todos los contactos con ese correo como bounced (no se enviarán).
  db.prepare("UPDATE contacts SET status='bounced' WHERE email = ?").run(e);
}

export function isSuppressed(email) {
  if (!email) return false;
  return !!db.prepare('SELECT 1 FROM suppression WHERE email = ?').get(String(email).trim().toLowerCase());
}

export function suppressionCount() {
  return db.prepare('SELECT COUNT(*) n FROM suppression').get().n;
}
