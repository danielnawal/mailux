// Reemplaza {{nombre}} y cualquier {{campo}} personalizado del contacto en el HTML.
export function personalize(html, contact) {
  let out = String(html || '');
  out = out.replace(/{{\s*nombre\s*}}/gi, contact.name || contact.email || '');
  let attrs = {};
  if (contact && contact.attributes) { try { attrs = JSON.parse(contact.attributes); } catch (e) { attrs = {}; } }
  for (const k of Object.keys(attrs)) {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('{{\\s*' + safe + '\\s*}}', 'gi'), attrs[k] == null ? '' : String(attrs[k]));
  }
  return out;
}
