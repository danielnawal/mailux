// Plantillas de correo predefinidas: responsive (max 600px), CSS en línea,
// botones a prueba de balas, sin emojis ni marcas. Variables {{...}} editables.
// El usuario elige una y luego la retoca en el editor de bloques.

const FONT = "Arial,Helvetica,sans-serif";

function button(label, color) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr><td align="center" bgcolor="${color}" style="border-radius:8px"><a href="{{cta_url}}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px">${label}</a></td></tr></table>`;
}

function wrap(bg, inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};padding:24px 12px;font-family:${FONT}"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">${inner}</table></td></tr></table>`;
}

function footer() {
  return `<tr><td style="background:#0f172a;padding:22px 30px;text-align:center;color:#94a3b8;font-size:12px;font-family:${FONT};line-height:1.6">{{empresa}}<br>{{unsubscribe_link}}</td></tr>`;
}

const imgPlaceholder = `<div style="background:#eef2f7;border-radius:10px;height:190px;line-height:190px;text-align:center;color:#94a3b8;font-size:13px">Imagen (reemplázala en el editor)</div>`;

export const TEMPLATES = [
  {
    name: 'Boletín',
    description: 'Boletín / newsletter mensual, limpio y profesional',
    variables: ['empresa', 'titulo', 'subtitulo', 'contenido', 'cta_url'],
    body_html: wrap('#eef2f7',
      `<tr><td style="background:#2563eb;padding:20px 30px;color:#ffffff;font-size:20px;font-weight:bold;font-family:${FONT}">{{empresa}}</td></tr>
       <tr><td style="padding:30px 30px 6px;font-family:${FONT}"><h1 style="margin:0 0 6px;font-size:24px;color:#0f172a">{{titulo}}</h1><p style="margin:0;color:#64748b;font-size:14px">Hola {{nombre}}, esto es lo nuevo de este mes.</p></td></tr>
       <tr><td style="padding:18px 30px">${imgPlaceholder}</td></tr>
       <tr><td style="padding:6px 30px 0;font-family:${FONT}"><h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">{{subtitulo}}</h2><p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.7">{{contenido}}</p></td></tr>
       <tr><td align="center" style="padding:4px 30px 32px">${button('Leer más', '#2563eb')}</td></tr>
       ${footer()}`)
  },
  {
    name: 'Oferta',
    description: 'Promoción / oferta con descuento destacado',
    variables: ['empresa', 'descuento', 'descripcion', 'vigencia', 'cta_url'],
    body_html: wrap('#fff7ed',
      `<tr><td style="background:#ea580c;padding:40px 30px;text-align:center;color:#ffffff;font-family:${FONT}"><div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;opacity:.9">Oferta especial</div><div style="font-size:54px;font-weight:bold;line-height:1.1;margin-top:6px">{{descuento}}%</div><div style="font-size:16px">de descuento</div></td></tr>
       <tr><td style="padding:30px 34px 8px;text-align:center;font-family:${FONT}"><p style="margin:0 0 8px;color:#9a3412;font-size:18px;font-weight:bold">Hola {{nombre}}</p><p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7">{{descripcion}}</p></td></tr>
       <tr><td align="center" style="padding:0 30px 14px">${button('Aprovechar la oferta', '#ea580c')}</td></tr>
       <tr><td style="padding:6px 30px 30px;text-align:center;color:#94a3b8;font-size:12px;font-family:${FONT}">Válida hasta {{vigencia}}</td></tr>
       ${footer()}`)
  },
  {
    name: 'Bienvenida',
    description: 'Correo de bienvenida con primeros pasos',
    variables: ['empresa', 'intro', 'paso1', 'paso2', 'paso3', 'cta_url'],
    body_html: wrap('#eef2ff',
      `<tr><td style="background:#4f46e5;padding:44px 30px;text-align:center;color:#ffffff;font-family:${FONT}"><h1 style="margin:0;font-size:26px">Bienvenido, {{nombre}}</h1><p style="margin:10px 0 0;font-size:16px;opacity:.92">Nos alegra tenerte con nosotros</p></td></tr>
       <tr><td style="padding:30px 34px 6px;font-family:${FONT}"><p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.7">{{intro}}</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}">
           <tr><td width="40" valign="top"><div style="width:30px;height:30px;border-radius:50%;background:#4f46e5;color:#fff;text-align:center;line-height:30px;font-weight:bold">1</div></td><td style="padding:0 0 16px;color:#334155;font-size:15px">{{paso1}}</td></tr>
           <tr><td width="40" valign="top"><div style="width:30px;height:30px;border-radius:50%;background:#4f46e5;color:#fff;text-align:center;line-height:30px;font-weight:bold">2</div></td><td style="padding:0 0 16px;color:#334155;font-size:15px">{{paso2}}</td></tr>
           <tr><td width="40" valign="top"><div style="width:30px;height:30px;border-radius:50%;background:#4f46e5;color:#fff;text-align:center;line-height:30px;font-weight:bold">3</div></td><td style="padding:0 0 4px;color:#334155;font-size:15px">{{paso3}}</td></tr>
         </table></td></tr>
       <tr><td align="center" style="padding:24px 30px 32px">${button('Comenzar ahora', '#4f46e5')}</td></tr>
       ${footer()}`)
  },
  {
    name: 'Novedad',
    description: 'Anuncio de producto o novedad con beneficios',
    variables: ['empresa', 'producto', 'descripcion', 'beneficio1', 'beneficio2', 'beneficio3', 'cta_url'],
    body_html: wrap('#ecfeff',
      `<tr><td style="background:#0d9488;padding:18px 30px;color:#ffffff;font-size:18px;font-weight:bold;font-family:${FONT}">{{empresa}}</td></tr>
       <tr><td style="padding:24px 30px 4px">${imgPlaceholder}</td></tr>
       <tr><td style="padding:18px 34px 4px;text-align:center;font-family:${FONT}"><h1 style="margin:0 0 8px;font-size:24px;color:#0f172a">Presentamos {{producto}}</h1><p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.7">{{descripcion}}</p></td></tr>
       <tr><td style="padding:0 34px 8px;font-family:${FONT}">
         <p style="margin:6px 0;color:#0f766e;font-size:15px">&#10003; {{beneficio1}}</p>
         <p style="margin:6px 0;color:#0f766e;font-size:15px">&#10003; {{beneficio2}}</p>
         <p style="margin:6px 0;color:#0f766e;font-size:15px">&#10003; {{beneficio3}}</p></td></tr>
       <tr><td align="center" style="padding:22px 30px 32px">${button('Ver más', '#0d9488')}</td></tr>
       ${footer()}`)
  },
  {
    name: 'Invitación',
    description: 'Invitación a un evento, con fecha y lugar',
    variables: ['empresa', 'evento', 'fecha', 'hora', 'lugar', 'cta_url'],
    body_html: wrap('#0b1220',
      `<tr><td style="background:#0f172a;padding:40px 30px;text-align:center;color:#ffffff;font-family:${FONT}"><div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#f59e0b">Estás invitado</div><h1 style="margin:10px 0 0;font-size:28px">{{evento}}</h1></td></tr>
       <tr><td style="padding:28px 34px 6px;text-align:center;font-family:${FONT}"><p style="margin:0 0 20px;color:#475569;font-size:15px">Hola {{nombre}}, te esperamos.</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
           <td align="center" style="padding:14px;border:1px solid #e2e8f0;border-radius:10px;font-family:${FONT}"><div style="color:#94a3b8;font-size:12px;text-transform:uppercase">Fecha</div><div style="color:#0f172a;font-size:16px;font-weight:bold;margin-top:4px">{{fecha}}</div><div style="color:#475569;font-size:14px">{{hora}}</div></td>
           <td width="14"></td>
           <td align="center" style="padding:14px;border:1px solid #e2e8f0;border-radius:10px;font-family:${FONT}"><div style="color:#94a3b8;font-size:12px;text-transform:uppercase">Lugar</div><div style="color:#0f172a;font-size:16px;font-weight:bold;margin-top:4px">{{lugar}}</div></td>
         </tr></table></td></tr>
       <tr><td align="center" style="padding:26px 30px 32px">${button('Confirmar asistencia', '#f59e0b')}</td></tr>
       ${footer()}`)
  },
  {
    name: 'Mensaje simple',
    description: 'Correo limpio y profesional, solo texto',
    variables: ['empresa', 'saludo', 'contenido', 'firma', 'cta_url'],
    body_html: wrap('#f3f4f6',
      `<tr><td style="padding:30px 34px 0;font-family:${FONT}"><div style="color:#2563eb;font-size:18px;font-weight:bold">{{empresa}}</div></td></tr>
       <tr><td style="padding:18px 34px 0;font-family:${FONT}"><p style="margin:0 0 14px;color:#0f172a;font-size:16px">{{saludo}} {{nombre}},</p><p style="margin:0 0 22px;color:#334155;font-size:15px;line-height:1.8">{{contenido}}</p></td></tr>
       <tr><td align="left" style="padding:0 34px 8px">${button('Más información', '#2563eb')}</td></tr>
       <tr><td style="padding:22px 34px 30px;font-family:${FONT};color:#475569;font-size:14px">{{firma}}</td></tr>
       ${footer()}`)
  }
];
