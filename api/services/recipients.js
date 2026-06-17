import db from '../db.js';

// Devuelve los contactos elegibles para una campaña aplicando TODAS las reglas:
// activos, validación (excluye inválidos; risky solo si la lista lo permite),
// supresión global, y el segmento opcional (atributo = valor).
export function eligibleContacts(campaign, includeToken) {
  const list = db.prepare('SELECT send_risky FROM contact_lists WHERE id = ?').get(campaign.list_id);
  const includeRisky = list && list.send_risky ? 1 : 0;
  const cols = includeToken ? 'id, email, name, attributes, unsubscribe_token' : 'email, name, attributes';
  const params = [campaign.list_id, includeRisky];
  let sql = `SELECT ${cols} FROM contacts
    WHERE list_id = ? AND status = 'active'
      AND (validation IS NULL OR validation = 'valid' OR (validation = 'risky' AND ? = 1))
      AND email NOT IN (SELECT email FROM suppression)`;
  if (campaign.segment_key && campaign.segment_value) {
    sql += " AND json_extract(attributes, '$.' || ?) = ?";
    params.push(campaign.segment_key, campaign.segment_value);
  }
  return db.prepare(sql).all(...params);
}
