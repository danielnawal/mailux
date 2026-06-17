# 📧 MAILUX — Manual de Usuario Completo

**Versión:** 1.0  
**Actualizado:** 2026-06-05  
**Plataforma:** Email Marketing Multi-Tenant

---

## 📑 ÍNDICE

1. [Introducción](#introducción)
2. [Primeros Pasos](#primeros-pasos)
3. [Inicio de Sesión](#inicio-de-sesión)
4. [Panel Principal (Dashboard)](#panel-principal)
5. [Gestión de Listas de Contactos](#gestión-de-listas)
6. [Crear y Enviar Campañas](#crear-y-enviar-campañas)
7. [Tracking de Emails](#tracking-de-emails)
8. [Plantillas Predefinidas](#plantillas-predefinidas)
9. [Estadísticas y Reportes](#estadísticas-y-reportes)
10. [Preguntas Frecuentes](#preguntas-frecuentes)
11. [Troubleshooting](#troubleshooting)

---

## Introducción

**Mailux** es una plataforma de email marketing diseñada para empresas que necesitan:
- ✅ Enviar campañas de email masivas
- ✅ Rastrear aperturas y clics en tiempo real
- ✅ Gestionar listas de contactos
- ✅ Automatizar envíos programados
- ✅ Detectar emails inválidos (bounce handling)

### Características Principales

| Característica | Descripción |
|---|---|
| **Multi-Tenant** | Cada distribuidor tiene datos completamente aislados |
| **Tracking de Aperturas** | Sabe cuándo cada usuario abre tu email |
| **Tracking de Clics** | Detecta qué links clickeó cada persona |
| **Bounce Handling** | Elimina automáticamente emails inválidos |
| **Plantillas** | 5 templates profesionales predefinidas |
| **Envío Programado** | Programa campañas para una fecha/hora específica |
| **Pausa/Reanudación** | Pausa un envío en curso y reanuda después |
| **Estadísticas** | Dashboard en tiempo real |

---

## Primeros Pasos

### 1️⃣ Acceder a Mailux

Abre tu navegador y ve a:

```
http://mailux.gpssoftwarenumberone.com
```

o (si accedes localmente):

```
http://127.0.0.1:4900
```

Deberías ver la **pantalla de login**.

### 2️⃣ Credenciales por Defecto

```
Email:    admin@mailux.com
Password: mailux2024
```

⚠️ **Cambia estas credenciales inmediatamente en producción**

### 3️⃣ Después del Login

Una vez autenticado, verás el **Dashboard** con:
- Total de listas de contactos
- Total de campañas
- Total de emails enviados
- Últimas 5 campañas

---

## Inicio de Sesión

### Paso a Paso

1. **Ingresa tu correo** en el campo "Correo"
   - Ejemplo: `admin@mailux.com`

2. **Ingresa tu contraseña** en el campo "Contraseña"

3. **Haz clic en "Ingresar"**

4. Si las credenciales son correctas, verás el **Dashboard**

5. Si hay error, recibirás un mensaje: "Credenciales inválidas"

### ¿Olvidaste la Contraseña?

Contacta a tu administrador. Las contraseñas se almacenan de forma segura (hash SHA-256) y no se pueden recuperar automáticamente.

---

## Panel Principal

El Dashboard es tu punto de partida. Aquí ves:

```
┌─────────────────────────────────────────────────────────────┐
│  MAILUX - Dashboard                                  [Salir] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 ESTADÍSTICAS                                            │
│  ├─ Total Listas: 5                                        │
│  ├─ Total Contactos: 2,450                                 │
│  ├─ Total Campañas: 12                                     │
│  ├─ Campañas Enviadas: 10                                  │
│  └─ Emails Enviados: 24,500                                │
│                                                              │
│  📧 ÚLTIMAS CAMPAÑAS                                        │
│  ├─ [Promo Navidad 2024]        Enviada    ✅ 2,450/2,450  │
│  ├─ [Newsletter Semanal]        Programada ⏱️ 2026-06-07   │
│  ├─ [Test Unsub]               Borrador   ✏️              │
│  └─ ...                                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Navegación

En la **barra izquierda** encontrarás:

```
📦 MENÚ
├─ 📊 Dashboard (aquí estás)
├─ 📋 Listas
└─ 📧 Campañas

🚪 ABAJO
└─ [usuario@email.com] [Salir]
```

---

## Gestión de Listas

Las **listas** son grupos de contactos a los que les enviarás emails.

### Crear una Nueva Lista

1. Haz clic en **"Listas"** en el menú
2. Haz clic en **"+ Nueva lista"**
3. Ingresa el nombre (ej: "Clientes VIP", "Newsletter Semanal")
4. Haz clic en **"Crear"**

✅ Tu lista está creada y lista para recibir contactos.

### Agregar Contactos

#### Opción 1: Subir CSV (Recomendado para muchos contactos)

1. En la lista, haz clic en **"Subir contactos (CSV)"**

2. Prepara un archivo CSV con este formato:

```csv
email,name
juan@example.com,Juan Pérez
maria@example.com,María García
carlos@example.com,Carlos López
```

**Campos válidos:**
- `email` (obligatorio) — dirección de correo válida
- `name` (opcional) — nombre del contacto

3. Haz clic en **"Seleccionar archivo"** y elige tu CSV

4. Haz clic en **"Subir"**

5. Recibirás un mensaje:
   - `Importados: 1,245`
   - `Inválidos: 5` (emails mal formados — serán ignorados)

#### Opción 2: Agregar Manualmente (1 a 1)

⚠️ No implementado aún — usa CSV.

### Ver Contactos de una Lista

1. Haz clic en la lista
2. Verás una tabla con:
   - Email
   - Nombre
   - Estado (active / unsubscribed / bounced)
   - Fecha agregado

---

## Crear y Enviar Campañas

### Paso 1: Crear Campaña

1. Haz clic en **"Campañas"** en el menú
2. Haz clic en **"+ Nueva campaña"**
3. Se abrirá un modal con los campos:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Nombre interno** | Solo para ti (no lo ven los contactos) | "Black Friday 2024" |
| **Lista de contactos** | Elige la lista a la que enviarás | "Clientes VIP" |
| **Asunto** | Asunto del email | "Oferta exclusiva: 50% off" |
| **Nombre del remitente** | Nombre que verá el usuario | "Mi Tienda" |
| **Correo del remitente** | Email desde el que se envía | "promo@mitienda.com" |
| **Cuerpo del correo (HTML)** | Contenido del email | Ver abajo ⬇️ |
| **Plantilla** (opcional) | Usa una predefinida | "Newsletter" |

### Paso 2: Rellenar Contenido

**Ejemplo de Cuerpo HTML:**

```html
<h1>¡Hola {{nombre}}!</h1>

<p>Tenemos una oferta especial solo para ti:</p>

<div style="background-color: #FF6B6B; color: white; padding: 20px; text-align: center;">
  <h2>50% de descuento</h2>
  <p>En toda la tienda</p>
  <a href="https://mitienda.com/ofertas" style="color: white; text-decoration: none; font-size: 18px;">
    VER OFERTA →
  </a>
</div>

<p>Válido hasta el 31 de diciembre.</p>

<p>¿No quieres recibir estos emails? {{unsubscribe_link}}</p>
```

**Variables Disponibles:**

| Variable | Resultado |
|----------|-----------|
| `{{nombre}}` | Se reemplaza con el nombre del contacto |
| `{{unsubscribe_link}}` | Link para que se desuscriba |

### Paso 3: Enviar Ahora o Programar

#### Opción A: Enviar Inmediatamente

1. Haz clic en **"Guardar borrador"** (primero)
2. Se guardará con estado "Borrador"
3. Luego haz clic en **"Enviar"** (botón azul)
4. Confirmará: "¿Enviar a 2,450 contactos?"
5. Haz clic en **"Confirmar"**

✅ El envío comenzará. Verás estado "Enviando..." y luego "Enviada"

#### Opción B: Programar para Después

1. En el modal, ingresa la **fecha y hora** en "Programar envío"
   - Ejemplo: `2026-06-10 09:00`
2. Haz clic en **"Guardar borrador"**
3. Estado cambiará a **"Programada"**
4. Se enviará automáticamente en la fecha especificada

### Paso 4: Monitorear Envío

Una vez que el envío comienza, verás:

```
📊 Estado: Enviando...
├─ Total: 2,450
├─ Enviados: 1,847 (75%)
├─ Fallidos: 3
└─ [PAUSAR] [Ver Estadísticas]
```

---

## Tracking de Emails

### Rastrear Aperturas

Cada email incluye automáticamente un **pixel invisible de 1x1** que se carga cuando el usuario abre el email.

```html
<!-- Agregado automáticamente al final de cada email -->
<img src="https://mailux.gpssoftwarenumberone.com/api/campaigns/123/pixel.gif?email=juan@example.com" 
     width="1" height="1" style="display:none;" alt="">
```

Cuando el email se abre, se registra automáticamente.

### Rastrear Clics

Cada **link en tu email** es automáticamente reescrito para pasar por nuestro servidor de tracking:

**Antes (tu HTML):**
```html
<a href="https://mitienda.com/ofertas">VER OFERTA</a>
```

**Después (automáticamente):**
```html
<a href="https://mailux.gpssoftwarenumberone.com/api/campaigns/123/track-click?url=https%3A%2F%2Fmitienda.com%2Fofertas&email=juan%40example.com">VER OFERTA</a>
```

Cuando el usuario clickea, se registra y **se redirige a la URL original**.

### Ver Estadísticas de Rastreo

1. Ve a **"Campañas"**
2. Busca tu campaña y haz clic en **"Ver Estadísticas"** (botón azul)
3. Verás un modal con:

```
📊 ESTADÍSTICAS DE CAMPAÑA

Asunto: Black Friday 2024
Enviados: 2,450
Fallidos: 3
Abiertos: 847 (35%)
Clickeados: 234 (10%)

📍 LINKS MÁS CLICKEADOS
├─ https://mitienda.com/ofertas — 156 clics
├─ https://mitienda.com/carrito — 45 clics
└─ https://mitienda.com/contacto — 33 clics
```

---

## Plantillas Predefinidas

Para ahorrar tiempo, Mailux incluye **5 plantillas profesionales**.

### Usar una Plantilla

1. En el modal de **"Nueva campaña"**
2. Busca el dropdown **"Usar plantilla"**
3. Elige una:

#### 1. Newsletter

Diseño clásico para newsletters semanales.

```html
┌─────────────────────────────┐
│   [Logo]    NEWSLETTER      │
├─────────────────────────────┤
│                             │
│   {{titulo}}                │
│                             │
│   {{contenido}}             │
│                             │
│   [{{cta_text}}]            │
│   {{cta_url}}               │
│                             │
│   Síguenos en redes...      │
└─────────────────────────────┘
```

**Variables a completar:**
- `{{titulo}}` — Título principal
- `{{contenido}}` — Contenido del boletín
- `{{cta_text}}` — Texto del botón
- `{{cta_url}}` — URL del botón

#### 2. Promoción

Diseño destacado para ofertas y promociones.

```html
┌──────────────────────────┐
│  🎉 OFERTA ESPECIAL 🎉  │
│                          │
│  {{descripcion_oferta}}  │
│                          │
│  [{{descuento}}% OFF]    │
│                          │
│  Válido hasta:           │
│  {{fecha_vencimiento}}   │
│                          │
│  [COMPRAR AHORA]         │
│  {{enlace_oferta}}       │
└──────────────────────────┘
```

#### 3. Bienvenida

Para emails de bienvenida a nuevos clientes.

```html
┌─────────────────────────┐
│  ¡Bienvenido {{nombre}}! │
│                         │
│  Nos alegra mucho que   │
│  te unas a nuestra      │
│  comunidad.             │
│                         │
│  Pasos siguientes:      │
│  1. Completa tu perfil  │
│  2. Explora nuestras    │
│     características     │
│  3. Obtén soporte       │
│                         │
│  {{email_soporte}}      │
└─────────────────────────┘
```

#### 4. Alerta

Para notificaciones urgentes.

```html
┌──────────────────────────┐
│  ⚠️ {{titulo}}           │
│                          │
│  {{detalle}}             │
│                          │
│  [ACTUAR AHORA]          │
│  {{accion_url}}          │
└──────────────────────────┘
```

#### 5. Resumen

Para resúmenes periódicos.

```html
┌────────────────────────────┐
│  RESUMEN DE {{periodo}}    │
│                            │
│  Aquí está lo que pasó:    │
│                            │
│  {{items}}                 │
│                            │
│  Gracias por tu atención   │
└────────────────────────────┘
```

### Personalizar una Plantilla

1. Elige una plantilla
2. Se precargará el HTML en el campo "Cuerpo del correo"
3. **Reemplaza las variables** con tus valores:
   - `{{titulo}}` → "Oferta Especial"
   - `{{contenido}}` → Tu contenido
   - etc.
4. Guarda la campaña

---

## Estadísticas y Reportes

### Dashboard Principal

En la página principal ("Dashboard"), ves estadísticas globales:

```
📊 ESTADÍSTICAS GLOBALES

Total Listas:         5
Total Contactos:      2,450
Total Campañas:       12
Campañas Enviadas:    10
Emails Enviados:      24,500
```

### Estadísticas por Campaña

Para ver detalles de una campaña específica:

1. Ve a **"Campañas"**
2. Encuentra tu campaña en la lista
3. Haz clic en el botón **"📊 Estadísticas"** (azul)

Verás:

```
CAMPAÑA: Black Friday 2024

Estado:           Enviada ✅
Enviados:         2,450
Fallidos:         3
Abiertos:         847 (35%)
Clickeados:       234 (10%)

LINKS MÁS CLICKEADOS
1. https://mitienda.com/ofertas  — 156 clics ⬆️
2. https://mitienda.com/carrito  — 45 clics
3. https://mitienda.com/contacto — 33 clics

Última actualización: Hace 2 minutos
[Actualizar automáticamente cada 2 segundos] ✅
```

### Descargar Reportes

⚠️ Feature en desarrollo — por ahora solo ves en pantalla.

---

## Preguntas Frecuentes

### ¿Cómo cambio mi contraseña?

Contacta a tu administrador. No hay auto-reset implementado aún.

### ¿Puedo deshacer un envío después de iniciar?

No. Una vez que comienza, se envía a todos los contactos. Pero puedes **PAUSAR**:

1. Ve a "Campañas"
2. Busca la campaña en estado "Enviando..."
3. Haz clic en **"PAUSAR"**
4. Detiene el envío en ese momento
5. Puedes **"REANUDAR"** después

### ¿Qué es bounce handling?

Los **bounces** son emails que "rebotan" (no pueden entregarse).

**Hard bounce:** Email no existe o dominio inválido → **se marca como "bounced"**

**Soft bounce:** Buzón lleno, problema temporal → se intenta nuevamente

Mailux detecta bounces automáticamente y **excluye esos contactos de campañas futuras**.

### ¿Quién ve si abro un email?

Solo **tú** (a través de Mailux). El tracking es privado y seguro.

El contacto NO sabe que estamos tracked. El pixel es invisible (1x1 px).

### ¿Cómo me desuscribo de tus emails?

Cada email **debe incluir** `{{unsubscribe_link}}`. Cuando el contacto hace clic:

1. Se marca como "unsubscribed"
2. No recibirá más emails de esa lista
3. Otros distribuidores siguen pudiendo enviarle (datos aislados)

### ¿Puedo enviar a múltiples listas en una campaña?

No. Una campaña = una lista.

**Workaround:** Crea dos campañas idénticas con diferentes listas.

### ¿Hay límite de contactos?

No. Puedes enviar a 1 millón de contactos si quieres.

Solo depende de:
- Tus credenciales AWS SES
- Límite de tasa de AWS SES (defecto: 14 emails/segundo)

### ¿Cómo funciona el envío programado?

1. Creas una campaña
2. Ingresas fecha/hora (ej: `2026-06-10 09:00`)
3. Mailux guarda con estado **"Programada"**
4. A las 09:00 del 10 de junio, **automáticamente** comienza el envío
5. No necesitas hacer nada más

---

## Troubleshooting

### El login no funciona

**Error:** "Credenciales inválidas"

**Soluciones:**
1. ✅ Verifica que escribiste bien el email
2. ✅ Verifica que escribiste bien la contraseña (sensible a mayúsculas)
3. ✅ Si no recuerdas la contraseña, contacta a tu admin

### No puedo crear una campaña

**Error:** "Selecciona una lista antes de enviar"

**Solución:**
1. Primero crea una lista (menú "Listas")
2. Sube contactos a la lista
3. Luego crea la campaña

### El email no se ve bien

**Problema:** HTML se ve feo en Outlook/Gmail

**Soluciones:**
1. Usa HTML simple (no CSS muy complejo)
2. Prueba con las **plantillas predefinidas** (están optimizadas)
3. Usa tablas en lugar de divs (compatibilidad Outlook)

### ¿Por qué algunos emails no se enviaron?

**Motivos comunes:**
1. **Email inválido** en la lista (se valida al subir CSV)
2. **Bounce previo** — contacto marcado como "bounced"
3. **Unsubscribed** — contacto se desinscribió antes
4. **Problema AWS SES** — credenciales inválidas

**Cómo verificar:**
1. Ve a **"Estadísticas"** de la campaña
2. Busca la tabla "Enviados/Fallidos"
3. Verás el motivo del error

### Las estadísticas no se actualizan

**Solución:**
1. Haz clic en **"Estadísticas"** nuevamente
2. Si está habilitado "Actualizar automáticamente", espera 2 segundos
3. Si no, haz clic en **"[Actualizar]"** manual

---

## 🎓 Guía Rápida de Mejores Prácticas

### Email Marketing 101

1. **Asuntos Claros**
   - ✅ "Oferta especial: 50% off en ropa"
   - ❌ "Mira esto"

2. **Personaliza con {{nombre}}**
   - ✅ "Hola {{nombre}}, tenemos una oferta especial para ti"
   - ❌ "Hola cliente"

3. **Incluye un CTA (Call-to-Action)**
   - ✅ "Haz clic aquí para comprar"
   - ❌ Email sin link clicable

4. **Incluye Unsubscribe**
   - ✅ "¿No quieres recibir emails? {{unsubscribe_link}}"
   - ❌ Email sin opción de desuscribirse (ilegal en muchos países)

5. **Prueba Antes de Enviar Masivo**
   - ✅ Envía a tu propia lista primero (5-10 personas)
   - ❌ Envía a 10,000 sin revisar

6. **Horarios Óptimos**
   - ✅ Martes-Jueves, 9 AM-12 PM (mayor apertura)
   - ❌ Domingos a las 3 AM

---

## 📞 Soporte

Si tienes problemas:

1. **Revisa esta documentación** (especialmente Troubleshooting)
2. **Contacta al administrador** de Mailux
3. **Revisa los logs** si tienes acceso técnico

---

**¡Listo para empezar a enviar campañas!** 🚀
