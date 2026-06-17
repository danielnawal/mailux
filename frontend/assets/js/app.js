const API = '/api';
let token = localStorage.getItem('mx_token');
let currentUser = JSON.parse(localStorage.getItem('mx_user') || 'null');
let uploadListId = null;

// --- API helper ---
async function api(method, path, body, isForm) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (isForm) opts.body = body;
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); return; }
  return res.json();
}

// --- Auth ---
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  const data = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: document.getElementById('login-email').value, password: document.getElementById('login-pass').value })
  }).then(r => r.json()).catch(() => ({}));
  btn.textContent = 'Ingresar'; btn.disabled = false;
  if (data.token) {
    token = data.token; currentUser = data.user;
    localStorage.setItem('mx_token', token);
    localStorage.setItem('mx_user', JSON.stringify(currentUser));
    showApp();
  } else {
    document.getElementById('login-error').textContent = data.error || 'Error al ingresar';
  }
});

function logout() {
  localStorage.removeItem('mx_token'); localStorage.removeItem('mx_user');
  token = null; currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}
document.getElementById('logout-btn').addEventListener('click', logout);

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('user-email-display').textContent = currentUser?.email || '';
  navigateTo('dashboard');
}

// --- Navigation ---
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
});

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  if (page === 'dashboard') loadDashboard();
  if (page === 'lists') loadLists();
  if (page === 'campaigns') loadCampaigns();
  if (page === 'landing') loadLandings();
}

// --- Dashboard ---
async function loadDashboard() {
  const stats = await api('GET', '/stats');
  if (!stats) return;
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Listas</div><div class="stat-value">${stats.total_lists}</div></div>
    <div class="stat-card"><div class="stat-label">Contactos</div><div class="stat-value">${stats.total_contacts.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Campañas</div><div class="stat-value">${stats.total_campaigns}</div></div>
    <div class="stat-card"><div class="stat-label">Correos enviados</div><div class="stat-value">${stats.total_sent.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Suprimidos (no se envían)</div><div class="stat-value">${(stats.suppressed||0).toLocaleString()}</div></div>
  `;
  const tbody = document.querySelector('#recent-table tbody');
  if (!stats.recent.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px">Sin campañas enviadas aun</td></tr>'; return; }
  tbody.innerHTML = stats.recent.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.subject}</td>
      <td>${c.sent.toLocaleString()}</td>
      <td>${c.failed}</td>
      <td>${c.sent_at ? c.sent_at.slice(0,16).replace('T',' ') : '-'}</td>
    </tr>`).join('');
}

// --- Lists ---
async function loadLists() {
  const lists = await api('GET', '/lists');
  if (!lists) return;
  const container = document.getElementById('lists-container');
  if (!lists.length) {
    container.innerHTML = '<div class="empty-state"><strong>Sin listas aun</strong><p>Crea tu primera lista de contactos</p></div>'; return;
  }
  container.innerHTML = lists.map(l => {
    const flags = [];
    if (l.invalid_count) flags.push(`<span style="color:#dc2626">${l.invalid_count} inválidos (no se envían)</span>`);
    if (l.risky_count) flags.push(`<span style="color:#f59e0b">${l.risky_count} riesgosos ${l.send_risky ? '(SÍ se envían)' : '(no se envían)'}</span>`);
    if (l.unvalidated_count) flags.push(`<span style="color:#9ca3af">${l.unvalidated_count} sin validar</span>`);
    const flagsHTML = flags.length ? `<p style="font-size:12px;margin:4px 0 0">${flags.join(' &middot; ')}</p>` : '';
    // El interruptor de riesgosos solo aparece si la lista tiene correos riesgosos.
    const riskyToggle = l.risky_count ? `
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;margin-top:8px;cursor:pointer">
          <input type="checkbox" ${l.send_risky ? 'checked' : ''} onchange="toggleRisky(${l.id}, this.checked)">
          Incluir los ${l.risky_count} riesgosos en el envío
        </label>` : '';
    return `
    <div class="list-card">
      <div class="list-info">
        <h3>${l.name}</h3>
        <p>${l.total_contacts.toLocaleString()} contactos &middot; Creada ${l.created_at.slice(0,10)}</p>
        ${flagsHTML}
        ${riskyToggle}
      </div>
      <div class="list-actions">
        <button class="btn-ghost btn-sm" onclick="openContacts(${l.id}, '${(l.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">Ver contactos</button>
        <button class="btn-ghost btn-sm" onclick="renameList(${l.id}, '${(l.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">Editar nombre</button>
        <button class="btn-ghost btn-sm" onclick="openUpload(${l.id})">Agregar contactos</button>
        <button class="btn-ghost btn-sm" onclick="validateList(${l.id})">Validar correos</button>
        <button class="btn-danger btn-sm" onclick="deleteList(${l.id},'${l.name}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('new-list-btn').addEventListener('click', () => {
  document.getElementById('new-list-name').value = '';
  document.getElementById('modal-new-list').style.display = 'flex';
});
document.getElementById('cancel-new-list').addEventListener('click', () => document.getElementById('modal-new-list').style.display = 'none');
document.getElementById('save-new-list').addEventListener('click', async () => {
  const name = document.getElementById('new-list-name').value.trim();
  if (!name) return;
  await api('POST', '/lists', { name });
  document.getElementById('modal-new-list').style.display = 'none';
  loadLists();
});

function openUpload(listId) {
  uploadListId = listId;
  document.getElementById('csv-file').value = '';
  document.getElementById('paste-emails').value = '';
  document.getElementById('upload-result').innerHTML = '';
  document.getElementById('modal-upload').style.display = 'flex';
}
document.getElementById('cancel-upload').addEventListener('click', () => document.getElementById('modal-upload').style.display = 'none');

function renderIngestResult(res) {
  const lines = [];
  lines.push(`<p style="color:#16a34a;font-weight:600;margin:0">${res.imported} contactos agregados</p>`);
  const detail = [];
  if (res.valid) detail.push(`${res.valid} válidos`);
  if (res.risky) detail.push(`<span style="color:#f59e0b">${res.risky} riesgosos</span>`);
  if (res.invalid_domain) detail.push(`<span style="color:#dc2626">${res.invalid_domain} dominio inexistente (no se enviarán)</span>`);
  if (res.duplicates) detail.push(`${res.duplicates} duplicados`);
  if (res.bad_format) detail.push(`${res.bad_format} formato inválido`);
  if (detail.length) lines.push(`<p style="font-size:13px;margin:6px 0 0">${detail.join(' &middot; ')}</p>`);
  return `<div style="margin-top:16px;padding:12px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac">${lines.join('')}</div>`;
}

document.getElementById('do-upload').addEventListener('click', async () => {
  const file = document.getElementById('csv-file').files[0];
  const pasted = document.getElementById('paste-emails').value.trim();
  if (!file && !pasted) { document.getElementById('upload-result').innerHTML = `<p style="color:#dc2626;margin-top:10px">Sube un archivo o pega los correos.</p>`; return; }

  const btn = document.getElementById('do-upload'); btn.textContent = 'Procesando...'; btn.disabled = true;
  let res;
  if (file) {
    const form = new FormData(); form.append('file', file);
    res = await api('POST', `/lists/${uploadListId}/upload`, form, true);
  } else {
    res = await api('POST', `/lists/${uploadListId}/paste`, { text: pasted });
  }
  btn.textContent = 'Agregar'; btn.disabled = false;

  if (res?.imported !== undefined) {
    document.getElementById('upload-result').innerHTML = renderIngestResult(res);
    setTimeout(() => { document.getElementById('modal-upload').style.display = 'none'; loadLists(); }, 2200);
  } else {
    document.getElementById('upload-result').innerHTML = `<p style="color:#dc2626;margin-top:10px">${res?.error || 'Error al agregar'}</p>`;
  }
});

// --- Ver / administrar contactos de una lista ---
let contactsListId = null;
let contactsListName = '';
let contactsFilter = '';
let selectedContacts = new Set();

function updateSelCount() {
  const btn = document.getElementById('del-selected');
  if (!btn) return;
  const n = selectedContacts.size;
  btn.textContent = `Eliminar seleccionados (${n})`;
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '.5' : '1';
}
function toggleSelectOne(id, checked) {
  if (checked) selectedContacts.add(id); else selectedContacts.delete(id);
  updateSelCount();
}
function toggleSelectAll(checked) {
  document.querySelectorAll('#contacts-list .rowsel').forEach(cb => {
    cb.checked = checked;
    const id = Number(cb.value);
    if (checked) selectedContacts.add(id); else selectedContacts.delete(id);
  });
  updateSelCount();
}
async function deleteSelected() {
  const ids = [...selectedContacts];
  if (!ids.length) return;
  if (!confirm(`¿Eliminar ${ids.length} contactos seleccionados? No se puede deshacer.`)) return;
  const res = await api('POST', `/lists/${contactsListId}/contacts/delete-batch`, { ids });
  if (res?.ok) { alert(`${res.deleted} contactos eliminados.`); loadContacts(); loadLists(); }
  else alert(res?.error || 'No se pudo eliminar');
}

const VAL_BADGE = {
  valid:   '<span style="color:#16a34a;font-weight:600">válido</span>',
  risky:   '<span style="color:#f59e0b;font-weight:600">riesgoso</span>',
  invalid: '<span style="color:#dc2626;font-weight:600">inválido</span>'
};

function openContacts(id, name) {
  contactsListId = id;
  contactsListName = name || 'Contactos';
  contactsFilter = '';
  document.getElementById('contacts-title').textContent = `Contactos — ${contactsListName}`;
  document.getElementById('modal-contacts').style.display = 'flex';
  loadContacts();
}
document.getElementById('close-contacts').addEventListener('click', () => document.getElementById('modal-contacts').style.display = 'none');

function setContactsFilter(f) { contactsFilter = f; loadContacts(); }

async function loadContacts() {
  const listEl = document.getElementById('contacts-list');
  listEl.innerHTML = '<p style="padding:16px;color:#9ca3af">Cargando...</p>';
  const q = contactsFilter ? `?filter=${contactsFilter}` : '';
  const data = await api('GET', `/lists/${contactsListId}/contacts${q}`);
  if (!data) return;
  const c = data.counts;

  // Filtros
  const fbtn = (key, label, n, color) => `<button class="btn-sm ${contactsFilter===key?'btn-primary':'btn-ghost'}" onclick="setContactsFilter('${key}')" style="${color?`color:${contactsFilter===key?'':color}`:''}">${label} (${n})</button>`;
  document.getElementById('contacts-filters').innerHTML =
    fbtn('', 'Todos', c.total) +
    fbtn('valid', 'Válidos', c.valid, '#16a34a') +
    fbtn('risky', 'Riesgosos', c.risky, '#f59e0b') +
    fbtn('invalid', 'Inválidos', c.invalid, '#dc2626') +
    (c.unvalidated ? fbtn('unvalidated', 'Sin validar', c.unvalidated, '#6b7280') : '');

  // Al recargar se reinicia la selección
  selectedContacts = new Set();

  // Acciones en bloque
  const bulk = [`<button class="btn-danger btn-sm" id="del-selected" onclick="deleteSelected()" disabled style="opacity:.5">Eliminar seleccionados (0)</button>`];
  if (c.invalid) bulk.push(`<button class="btn-danger btn-sm" onclick="purgeContacts('invalid', ${c.invalid})">Eliminar ${c.invalid} inválidos</button>`);
  if (c.risky) bulk.push(`<button class="btn-warning btn-sm" onclick="purgeContacts('risky', ${c.risky})">Eliminar ${c.risky} riesgosos</button>`);
  document.getElementById('contacts-bulk').innerHTML = bulk.join('');

  // Tabla con casilla de selección por fila + casilla "todos"
  if (!data.contacts.length) {
    listEl.innerHTML = '<p style="padding:16px;color:#9ca3af">No hay contactos en este filtro.</p>';
  } else {
    listEl.innerHTML = `<table class="table" style="margin:0"><thead><tr>
        <th style="width:36px;text-align:center"><input type="checkbox" id="sel-all" onclick="toggleSelectAll(this.checked)" title="Seleccionar todos"></th>
        <th>Correo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead><tbody>${
      data.contacts.map(ct => `<tr>
        <td style="text-align:center"><input type="checkbox" class="rowsel" value="${ct.id}" onchange="toggleSelectOne(${ct.id}, this.checked)"></td>
        <td>${ct.email}</td>
        <td>${ct.name || '-'}</td>
        <td>${VAL_BADGE[ct.validation] || '<span style="color:#9ca3af">sin validar</span>'}${ct.validation==='risky'||ct.validation==='invalid' ? `<br><span style="font-size:11px;color:#9ca3af">${ct.validation_reason||''}</span>` : ''}</td>
        <td><button class="btn-danger btn-sm" onclick="deleteContact(${ct.id})">Eliminar</button></td>
      </tr>`).join('')
    }</tbody></table>`;
  }
  updateSelCount();
  document.getElementById('contacts-note').textContent =
    `${c.total.toLocaleString()} contactos en total. Inválidos y riesgosos no se envían (salvo que actives el interruptor de riesgosos).` +
    (data.shown >= 1000 ? ' Se muestran los primeros 1000; usa los filtros para ver el resto.' : '');
}

async function deleteContact(cid) {
  if (!confirm('¿Eliminar este contacto de la lista?')) return;
  const res = await api('DELETE', `/lists/${contactsListId}/contacts/${cid}`);
  if (res?.ok) loadContacts(); else alert(res?.error || 'No se pudo eliminar');
}

async function purgeContacts(which, n) {
  const label = which === 'invalid' ? 'inválidos' : 'riesgosos';
  if (!confirm(`¿Eliminar los ${n} contactos ${label} de esta lista? No se puede deshacer.`)) return;
  const res = await api('POST', `/lists/${contactsListId}/contacts/purge`, { which });
  if (res?.ok) { alert(`${res.deleted} ${label} eliminados.`); loadContacts(); loadLists(); }
  else alert(res?.error || 'No se pudo eliminar');
}

async function toggleRisky(id, checked) {
  const res = await api('PATCH', `/lists/${id}/send-risky`, { value: checked ? 1 : 0 });
  if (!res?.ok) { alert(res?.error || 'No se pudo cambiar'); }
  loadLists();
}

async function validateList(id) {
  const res = await api('POST', `/lists/${id}/validate`);
  if (res?.total !== undefined) {
    if (res.total === 0) { alert('La lista no tiene contactos para validar.'); return; }
    alert(`Validación: ${res.message}.\n\nLos inválidos quedan excluidos automáticamente del envío.`);
    loadLists();
  } else {
    alert(res?.error || 'No se pudo validar');
  }
}

async function renameList(id, current) {
  const name = prompt('Nuevo nombre de la lista:', current || '');
  if (name === null) return;
  if (!name.trim()) { alert('El nombre no puede estar vacío.'); return; }
  const res = await api('PATCH', `/lists/${id}`, { name: name.trim() });
  if (res?.ok) loadLists(); else alert(res?.error || 'No se pudo renombrar');
}

async function deleteList(id, name) {
  if (!confirm(`Eliminar la lista "${name}" y todos sus contactos?`)) return;
  await api('DELETE', `/lists/${id}`);
  loadLists();
}

// --- Campaigns ---
async function loadCampaigns() {
  const campaigns = await api('GET', '/campaigns');
  if (!campaigns) return;
  const container = document.getElementById('campaigns-container');
  const sandboxNotice = '<div class="sandbox-notice">Envío real por Amazon SES activo. AWS aún en modo sandbox: por ahora solo llegan a correos verificados en tu cuenta SES; cuando AWS apruebe producción podrás enviar a cualquier destinatario.</div>';
  if (!campaigns.length) {
    container.innerHTML = sandboxNotice + '<div class="empty-state"><strong>Sin campañas aun</strong><p>Crea tu primera campaña</p></div>'; return;
  }
  const badges = { draft:'badge-draft', scheduled:'badge-warning', sending:'badge-sending', paused:'badge-warning', sent:'badge-sent', failed:'badge-failed' };
  const labels = { draft:'Borrador', scheduled:'Programada', sending:'Enviando...', paused:'Pausada', sent:'Enviada', failed:'Fallida' };
  container.innerHTML = sandboxNotice + campaigns.map(c => {
    const scheduledInfo = c.scheduled_at ? ` &middot; Envío: ${new Date(c.scheduled_at).toLocaleString()}` : '';
    return `
    <div class="campaign-card">
      <div class="campaign-header">
        <div class="campaign-name">${c.name}</div>
        <span class="badge ${badges[c.status]}">${labels[c.status]}</span>
      </div>
      <div class="campaign-meta">Asunto: ${c.subject} &middot; Lista: ${c.list_name || 'Sin lista'}${scheduledInfo} &middot; ${c.created_at.slice(0,10)}</div>
      <div class="campaign-footer">
        <div style="font-size:13px;color:#6b7280">${c.sent} enviados &middot; ${c.failed} fallidos de ${c.total}</div>
        <div class="campaign-actions">
          ${c.status === 'draft' ? `<button class="btn-ghost btn-sm" onclick="editCampaign(${c.id})">Editar</button>` : ''}
          ${c.status === 'draft' ? `<button class="btn-send btn-sm" onclick="sendCampaign(${c.id},'${c.name}')">Enviar ahora</button>` : ''}
          ${c.status === 'sending' ? `<button class="btn-warning btn-sm" onclick="pauseCampaign(${c.id})">Pausar</button>` : ''}
          ${c.status === 'paused' ? `<button class="btn-send btn-sm" onclick="resumeCampaign(${c.id})">Reanudar</button>` : ''}
          ${c.status === 'scheduled' ? `<button class="btn-danger btn-sm" onclick="cancelSchedule(${c.id})">Cancelar</button>` : ''}
          ${c.status === 'sent' ? `<button class="btn-ghost btn-sm" onclick="viewStats(${c.id},'${c.name}')">Ver estadísticas</button>` : ''}
          <button class="btn-ghost btn-sm" onclick="duplicateCampaign(${c.id},'${c.name}')">Duplicar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('new-campaign-btn').addEventListener('click', async () => {
  const lists = await api('GET', '/lists');
  const templates = await fetch(API + '/campaigns/templates/list').then(r => r.json()).catch(() => []);

  const select = document.getElementById('c-list');
  select.innerHTML = '<option value="">-- Seleccionar lista --</option>' + (lists || []).map(l => `<option value="${l.id}">${l.name} (${l.total_contacts} contactos)</option>`).join('');

  const templateSelect = document.getElementById('c-template');
  templateSelect.innerHTML = '<option value="">-- Ninguna (en blanco) --</option>' + (templates || []).map(t => `<option value="${t.id}" data-name="${t.name}">${t.name}${t.description ? ' - ' + t.description : ''}</option>`).join('');

  ['c-name','c-subject','c-from-name','c-from-email','c-body','c-template','c-seg-key','c-seg-value'].forEach(id => {
    if (id === 'c-template') document.getElementById(id).value = '';
    else if (id !== 'c-list') document.getElementById(id).value = '';
  });
  document.getElementById('c-fields-hint').innerHTML = 'Campos disponibles de la lista: (elige una lista). Úsalos también en el correo como <code>{{campo}}</code>.';
  document.getElementById('modal-new-campaign').style.display = 'flex';
});

async function loadListFields(listId) {
  const hint = document.getElementById('c-fields-hint');
  if (!listId) { hint.innerHTML = 'Campos disponibles de la lista: (elige una lista). Úsalos también en el correo como <code>{{campo}}</code>.'; return; }
  const res = await api('GET', `/lists/${listId}/fields`);
  const fields = res?.fields || [];
  hint.innerHTML = fields.length
    ? 'Campos de esta lista: ' + fields.map(f => `<code>{{${f}}}</code>`).join(' ') + '. Úsalos en el correo o en el segmento.'
    : 'Esta lista no tiene campos personalizados (solo {{nombre}}). Importa un Excel/CSV con columnas extra para tenerlos.';
}
document.getElementById('c-list').addEventListener('change', e => loadListFields(e.target.value));
document.getElementById('c-template').addEventListener('change', async (e) => {
  const templateId = e.target.value;
  const bodyField = document.getElementById('c-body');
  const hint = document.getElementById('template-hint');

  if (!templateId) {
    bodyField.value = '';
    hint.style.display = 'none';
    return;
  }

  try {
    const template = await fetch(API + `/campaigns/templates/${templateId}`).then(r => r.json()).catch(() => null);
    if (template && template.body_html) {
      bodyField.value = template.body_html;
      hint.style.display = 'block';
      hint.textContent = `Plantilla "${template.name}" cargada. Reemplaza las variables como {{titulo}}, {{contenido}}, {{cta_url}}, etc.`;
    }
  } catch (err) {
    console.error('Error cargando plantilla:', err);
  }
});

document.getElementById('cancel-new-campaign').addEventListener('click', () => document.getElementById('modal-new-campaign').style.display = 'none');
document.getElementById('save-new-campaign').addEventListener('click', async () => {
  const payload = {
    name: document.getElementById('c-name').value,
    subject: document.getElementById('c-subject').value,
    from_name: document.getElementById('c-from-name').value,
    from_email: document.getElementById('c-from-email').value,
    body_html: document.getElementById('c-body').value,
    list_id: document.getElementById('c-list').value || null,
    segment_key: document.getElementById('c-seg-key').value.trim(),
    segment_value: document.getElementById('c-seg-value').value.trim()
  };
  if (!payload.name || !payload.subject || !payload.from_name || !payload.from_email || !payload.body_html) {
    alert('Completa todos los campos requeridos'); return;
  }

  if (editingCampaignId) {
    const res = await api('PUT', `/campaigns/${editingCampaignId}`, payload);
    if (!res?.ok) { alert(res?.error || 'Error al guardar'); return; }
    editingCampaignId = null;
  } else {
    const res = await api('POST', '/campaigns', payload);
    if (!res?.id) { alert(res?.error || 'Error al guardar'); return; }

    const scheduled = document.getElementById('c-schedule').value;
    if (scheduled) {
      const schedRes = await api('POST', `/campaigns/${res.id}/schedule`, { scheduled_at: new Date(scheduled).toISOString() });
      if (!schedRes?.ok) { alert(schedRes?.error || 'Error al programar'); }
    }
  }

  document.getElementById('modal-new-campaign').style.display = 'none';
  loadCampaigns();
});

async function sendCampaign(id, name) {
  if (!confirm(`Enviar la campaña "${name}" a todos los contactos activos de la lista?`)) return;
  const res = await api('POST', `/campaigns/${id}/send`);
  if (res?.ok) { alert(`Envio iniciado: ${res.total} correos en cola.`); loadCampaigns(); }
  else alert(res?.error || 'Error al enviar');
}

async function cancelSchedule(id) {
  if (!confirm('¿Cancelar programación de esta campaña?')) return;
  const res = await api('DELETE', `/campaigns/${id}/schedule`);
  if (res?.ok) { alert('Programación cancelada'); loadCampaigns(); }
  else alert(res?.error || 'Error al cancelar');
}

async function duplicateCampaign(id, name) {
  const res = await api('POST', `/campaigns/${id}/duplicate`);
  if (res?.id) { alert(`Campaña "${res.name}" creada correctamente`); loadCampaigns(); }
  else alert(res?.error || 'Error al duplicar');
}

async function pauseCampaign(id) {
  const res = await api('PATCH', `/campaigns/${id}/pause`);
  if (res?.ok) { alert('Campaña pausada'); loadCampaigns(); }
  else alert(res?.error || 'Error al pausar');
}

async function resumeCampaign(id) {
  const res = await api('PATCH', `/campaigns/${id}/resume`);
  if (res?.ok) { alert('Envío reanudado'); loadCampaigns(); }
  else alert(res?.error || 'Error al reanudar');
}

let editingCampaignId = null;

async function editCampaign(id) {
  const campaign = await api('GET', `/campaigns/${id}`);
  if (!campaign) { alert('Campaña no encontrada'); return; }

  editingCampaignId = id;
  const lists = await api('GET', '/lists');
  const select = document.getElementById('c-list');
  select.innerHTML = '<option value="">-- Seleccionar --</option>' + (lists || []).map(l => `<option value="${l.id}" ${l.id === campaign.list_id ? 'selected' : ''}>${l.name}</option>`).join('');

  document.getElementById('c-name').value = campaign.name;
  document.getElementById('c-subject').value = campaign.subject;
  document.getElementById('c-from-name').value = campaign.from_name;
  document.getElementById('c-from-email').value = campaign.from_email;
  document.getElementById('c-body').value = campaign.body_html;
  document.getElementById('c-schedule').value = '';
  document.getElementById('c-seg-key').value = campaign.segment_key || '';
  document.getElementById('c-seg-value').value = campaign.segment_value || '';
  loadListFields(campaign.list_id);

  document.getElementById('modal-new-campaign').style.display = 'flex';
}

let statsIntervalId = null;

async function viewStats(id, name) {
  if (statsIntervalId) clearInterval(statsIntervalId);

  const updateStats = async () => {
    const stats = await api('GET', `/campaigns/${id}/stats`);
    if (!stats) return;
    const openRate = stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : 0;
    document.getElementById('stats-content').innerHTML = `
      <div class="stats-row"><span>Total contactos</span><span>${stats.total.toLocaleString()}</span></div>
      <div class="stats-row"><span>Enviados</span><span style="color:#16a34a">${stats.sent.toLocaleString()}</span></div>
      <div class="stats-row"><span>Aperturas</span><span style="color:#3b82f6;font-weight:700">${stats.opened || 0} (${openRate}%)</span></div>
      <div class="stats-row"><span>Fallidos</span><span style="color:#dc2626">${stats.failed}</span></div>
      <div class="stats-row"><span>Estado</span><span>${stats.status}</span></div>
      <div class="stats-row"><span>Fecha de envío</span><span>${stats.sent_at ? stats.sent_at.slice(0,16).replace('T',' ') : '-'}</span></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:10px;text-align:right">Actualizado automáticamente</div>
    `;
  };

  document.getElementById('stats-title').textContent = name;
  await updateStats();
  statsIntervalId = setInterval(updateStats, 2000);
  document.getElementById('modal-stats').style.display = 'flex';
}

document.getElementById('close-stats').addEventListener('click', () => {
  if (statsIntervalId) clearInterval(statsIntervalId);
  document.getElementById('modal-stats').style.display = 'none';
});
document.getElementById('close-stats').addEventListener('click', () => document.getElementById('modal-stats').style.display = 'none');

// ===== Landing pages =====
let editingLandingId = null;
let lpImageUrl = null;

async function loadLandings() {
  const pages = await api('GET', '/landing');
  if (!pages) return;
  const c = document.getElementById('landing-container');
  if (!pages.length) { c.innerHTML = '<div class="empty-state"><strong>Sin landing pages</strong><p>Crea una página para captar clientes nuevos</p></div>'; return; }
  c.innerHTML = pages.map(p => `
    <div class="list-card">
      <div class="list-info">
        <h3>${p.title}</h3>
        <p>Lista: ${p.list_name || 'sin lista'} &middot; ${p.submissions || 0} registros</p>
        <p style="font-size:12px;margin:4px 0 0"><a href="${p.url}" target="_blank" style="color:#2563eb">${p.url}</a></p>
      </div>
      <div class="list-actions">
        <button class="btn-ghost btn-sm" onclick="window.open('${p.url}','_blank')">Ver</button>
        <button class="btn-ghost btn-sm" onclick="copyLanding('${p.url}')">Copiar enlace</button>
        <button class="btn-ghost btn-sm" onclick="editLanding(${p.id})">Editar</button>
        <button class="btn-danger btn-sm" onclick="deleteLanding(${p.id},'${(p.title||'').replace(/'/g,"\\'")}')">Eliminar</button>
      </div>
    </div>`).join('');
}

function copyLanding(url) {
  navigator.clipboard?.writeText(url).then(() => alert('Enlace copiado:\n' + url), () => prompt('Copia el enlace:', url));
}

async function openLandingModal() {
  const lists = await api('GET', '/lists');
  document.getElementById('lp-list').innerHTML = '<option value="">-- Seleccionar --</option>' + (lists || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  document.getElementById('modal-landing').style.display = 'flex';
}

document.getElementById('new-landing-btn').addEventListener('click', async () => {
  editingLandingId = null; lpImageUrl = null;
  document.getElementById('landing-modal-title').textContent = 'Nueva landing';
  ['lp-title','lp-subtitle','lp-body','lp-button','lp-welcome-from','lp-welcome-subject','lp-welcome-html'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lp-color').value = '#2563eb';
  document.getElementById('lp-img-name').textContent = '';
  document.getElementById('lp-welcome').checked = false;
  await openLandingModal();
});
document.getElementById('cancel-landing').addEventListener('click', () => document.getElementById('modal-landing').style.display = 'none');

document.getElementById('lp-img-btn').addEventListener('click', () => document.getElementById('lp-img-input').click());
document.getElementById('lp-img-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = await uploadFile('/uploads/image', file);
    lpImageUrl = data?.data?.[0]?.src;
    document.getElementById('lp-img-name').textContent = lpImageUrl ? 'Imagen lista' : '';
  } catch (err) { alert('No se pudo subir la imagen: ' + err.message); }
});

document.getElementById('save-landing').addEventListener('click', async () => {
  const payload = {
    title: document.getElementById('lp-title').value.trim(),
    subtitle: document.getElementById('lp-subtitle').value.trim(),
    body: document.getElementById('lp-body').value.trim(),
    button_text: document.getElementById('lp-button').value.trim() || 'Suscribirme',
    color: document.getElementById('lp-color').value,
    list_id: document.getElementById('lp-list').value || null,
    image_url: lpImageUrl || null,
    welcome_enabled: document.getElementById('lp-welcome').checked ? 1 : 0,
    welcome_from: document.getElementById('lp-welcome-from').value.trim(),
    welcome_subject: document.getElementById('lp-welcome-subject').value.trim(),
    welcome_html: document.getElementById('lp-welcome-html').value.trim()
  };
  if (!payload.title) { alert('Pon un título.'); return; }
  if (!editingLandingId && !payload.list_id) { alert('Elige a qué lista entran los registros.'); return; }
  let res;
  if (editingLandingId) res = await api('PATCH', `/landing/${editingLandingId}`, payload);
  else res = await api('POST', '/landing', payload);
  if (res?.ok || res?.id) {
    document.getElementById('modal-landing').style.display = 'none';
    loadLandings();
    if (res?.url) alert('Landing publicada. Su enlace público es:\n' + res.url);
  } else alert(res?.error || 'No se pudo guardar');
});

async function editLanding(id) {
  const pages = await api('GET', '/landing');
  const p = (pages || []).find(x => x.id === id);
  if (!p) return;
  editingLandingId = id; lpImageUrl = p.image_url || null;
  document.getElementById('landing-modal-title').textContent = 'Editar landing';
  await openLandingModal();
  document.getElementById('lp-title').value = p.title || '';
  document.getElementById('lp-subtitle').value = p.subtitle || '';
  document.getElementById('lp-body').value = p.body || '';
  document.getElementById('lp-button').value = p.button_text || '';
  document.getElementById('lp-color').value = /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#2563eb';
  document.getElementById('lp-list').value = p.list_id || '';
  document.getElementById('lp-img-name').textContent = p.image_url ? 'Imagen lista' : '';
  document.getElementById('lp-welcome').checked = !!p.welcome_enabled;
  document.getElementById('lp-welcome-from').value = p.welcome_from || '';
  document.getElementById('lp-welcome-subject').value = p.welcome_subject || '';
  document.getElementById('lp-welcome-html').value = p.welcome_html || '';
}

async function deleteLanding(id, title) {
  if (!confirm(`¿Eliminar la landing "${title}"?`)) return;
  const res = await api('DELETE', `/landing/${id}`);
  if (res?.ok) loadLandings(); else alert(res?.error || 'No se pudo eliminar');
}

// ===== Editor de bloques (GrapesJS) + vista previa + envío de prueba =====
let gjsEditor = null;

function initDesigner() {
  if (gjsEditor) return gjsEditor;
  const preset = window['grapesjs-preset-newsletter'] || 'grapesjs-preset-newsletter';
  gjsEditor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    fromElement: false,
    storageManager: false,
    plugins: [preset],
    pluginsOpts: {
      'grapesjs-preset-newsletter': {
        modalLabelImport: 'Pega tu HTML',
        modalLabelExport: 'Copia este HTML',
        cellStyle: { 'font-size': '14px', padding: '0', 'vertical-align': 'top' }
      }
    },
    assetManager: {
      upload: API + '/uploads/image',
      uploadName: 'file',
      headers: { Authorization: 'Bearer ' + token },
      autoAdd: true
    }
  });
  window.gjsEditor = gjsEditor;

  // Traducir los nombres de los bloques al español (el preset viene en inglés).
  const T = {
    '1 Section': '1 Columna', '1/2 Section': '2 Columnas', '1/3 Section': '3 Columnas',
    '3/7 Section': '2 Columnas (1/3 + 2/3)', 'Button': 'Botón', 'Divider': 'Separador',
    'Text': 'Texto', 'Text Section': 'Sección de texto', 'Image': 'Imagen', 'Quote': 'Cita',
    'Link': 'Enlace', 'Link Block': 'Bloque enlazable', 'Grid Items': 'Cuadrícula', 'List Items': 'Lista'
  };
  try {
    gjsEditor.BlockManager.getAll().forEach(b => { const l = b.get('label'); if (T[l]) b.set('label', T[l]); });
    gjsEditor.BlockManager.render();
  } catch (e) {}

  return gjsEditor;
}

function openDesigner() {
  if (typeof grapesjs === 'undefined') { alert('No se pudo cargar el editor visual (revisa la conexión a internet).'); return; }
  document.getElementById('designer').style.display = 'flex';
  const ed = initDesigner();
  const current = (document.getElementById('c-body').value || '').trim();
  ed.setComponents(current || '<table style="width:100%;max-width:600px;margin:0 auto;font-family:Arial,sans-serif"><tr><td style="padding:24px"><h1>Hola {{nombre}}</h1><p>Escribe tu mensaje o arrastra bloques desde la derecha. Para una imagen, usa el botón "Insertar imagen" de arriba.</p></td></tr></table>');
  setTimeout(() => {
    try { ed.refresh(); } catch (e) {}
    try { ed.runCommand('open-blocks'); } catch (e) {}   // mostrar el panel de bloques por defecto
  }, 80);
}

document.getElementById('open-designer').addEventListener('click', openDesigner);
document.getElementById('designer-cancel').addEventListener('click', () => document.getElementById('designer').style.display = 'none');
document.getElementById('designer-save').addEventListener('click', () => {
  if (!gjsEditor) return;
  const html = gjsEditor.runCommand('gjs-get-inlined-html');
  document.getElementById('c-body').value = html;
  document.getElementById('designer').style.display = 'none';
});

// Sube un archivo y devuelve el JSON, con errores claros (no falla en silencio).
async function uploadFile(path, file) {
  const form = new FormData(); form.append('file', file);
  let r;
  try {
    r = await fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  } catch (e) {
    throw new Error('No hay conexión con el servidor.');
  }
  if (r.status === 413) throw new Error('El archivo es demasiado pesado.');
  if (r.status === 401) { logout(); throw new Error('Tu sesión expiró, vuelve a entrar.'); }
  let data = null;
  try { data = await r.json(); } catch (e) { throw new Error('El servidor respondió con un error (' + r.status + ').'); }
  if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
  return data;
}

// Insertar imagen subiéndola desde el PC
document.getElementById('designer-img').addEventListener('click', () => document.getElementById('img-file-input').click());
document.getElementById('img-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const btn = document.getElementById('designer-img');
  const prev = btn.textContent; btn.textContent = 'Subiendo...'; btn.disabled = true;
  try {
    const data = await uploadFile('/uploads/image', file);
    const url = data?.data?.[0]?.src;
    if (!url) throw new Error('No se recibió la imagen.');
    gjsEditor.addComponents(`<img src="${url}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto"/>`);
  } catch (err) {
    alert('No se pudo subir la imagen: ' + err.message);
  } finally {
    btn.textContent = prev; btn.disabled = false;
  }
});

// Insertar PDF como botón de descarga
document.getElementById('designer-pdf').addEventListener('click', () => document.getElementById('pdf-file-input').click());
document.getElementById('pdf-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const btn = document.getElementById('designer-pdf');
  const prev = btn.textContent; btn.textContent = 'Subiendo...'; btn.disabled = true;
  try {
    const res = await uploadFile('/uploads/pdf', file);
    if (!res?.url) throw new Error('No se recibió el PDF.');
    gjsEditor.addComponents(`<table style="margin:16px auto"><tbody><tr><td style="background:#2563eb;border-radius:6px"><a href="${res.url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">Descargar ${res.name}</a></td></tr></tbody></table>`);
  } catch (err) {
    alert('No se pudo subir el PDF: ' + err.message);
  } finally {
    btn.textContent = prev; btn.disabled = false;
  }
});

// Vista previa (escritorio / celular)
function buildPreviewHtml() {
  let html = document.getElementById('c-body').value || '<p style="font-family:Arial;padding:24px;color:#888">(El correo está vacío. Diseña o escribe el contenido.)</p>';
  html = html.replace(/{{nombre}}/gi, 'Cliente');
  html = html.replace(/{{unsubscribe_link}}/gi, '<a href="#" style="color:#999;font-size:12px;text-decoration:none">Cancelar suscripción</a>');
  return html;
}
function setPreviewWidth(mode) {
  document.getElementById('preview-frame').style.width = mode === 'mobile' ? '380px' : '100%';
}
document.getElementById('preview-email').addEventListener('click', () => {
  document.getElementById('preview-frame').srcdoc = buildPreviewHtml();
  setPreviewWidth('desktop');
  document.getElementById('modal-preview').style.display = 'flex';
});
document.getElementById('preview-desktop').addEventListener('click', () => setPreviewWidth('desktop'));
document.getElementById('preview-mobile').addEventListener('click', () => setPreviewWidth('mobile'));
document.getElementById('close-preview').addEventListener('click', () => document.getElementById('modal-preview').style.display = 'none');

// Enviar prueba a un correo
document.getElementById('test-email').addEventListener('click', async () => {
  const body_html = document.getElementById('c-body').value;
  const subject = document.getElementById('c-subject').value;
  const from_name = document.getElementById('c-from-name').value;
  const from_email = document.getElementById('c-from-email').value;
  if (!body_html || !subject || !from_email) { alert('Completa al menos el remitente, el asunto y el contenido antes de enviar la prueba.'); return; }
  const to = prompt('¿A qué correo envío la prueba?\n(En modo sandbox de AWS debe ser un correo verificado en tu cuenta SES.)', 'comercial@starlinkgps.net');
  if (!to) return;
  const res = await api('POST', '/campaigns/test-send', { to, from_name, from_email, subject, body_html });
  alert(res?.ok ? res.message : (res?.error || 'No se pudo enviar la prueba'));
});

// Iniciar
if (token && currentUser) showApp();
