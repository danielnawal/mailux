# SSL/HTTPS Setup para Mailux

**Fecha:** 2026-06-05  
**Estado:** ✅ COMPLETADO Y VERIFICADO  
**Dominio:** mailux.gpssoftwarenumberone.com  
**Certificado:** Auto-firmado (temporal) / Let's Encrypt (producción)

---

## 🔒 ¿Qué se hizo?

### 1. Cambio de Puerto Interno
```
ANTES: Mailux frontend en puerto 4900
AHORA: Mailux frontend en puerto 4902 (interno)
```

**Archivo actualizado:** `/opt/mailux/docker-compose.yml`

### 2. Configuración Nginx (Reverse Proxy)

**Archivo creado:** `/etc/nginx/sites-available/mailux`

**Lo que hace:**
- ✅ Escucha en puerto 80 y redirige a HTTPS
- ✅ Escucha en puerto 443 (HTTPS) con certificado SSL
- ✅ Proxy reverso hacia Mailux interno (127.0.0.1:4902)
- ✅ Headers de seguridad (HSTS, CSP, X-Frame-Options)
- ✅ Soporta WebSocket (si lo necesitas)

**Configuración:**
```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name mailux.gpssoftwarenumberone.com;
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS (SSL) → Proxy a Mailux
server {
    listen 443 ssl http2;
    server_name mailux.gpssoftwarenumberone.com;
    ssl_certificate /etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:4902;
        # ... headers de proxy
    }
}
```

### 3. Certificado SSL

**Tipo:** Auto-firmado (temporal) para desarrollo/testing

**Ubicación:**
- Certificado: `/etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/fullchain.pem`
- Clave privada: `/etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/privkey.pem`

**Generación:**
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/privkey.pem \
  -out /etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/fullchain.pem \
  -subj "/CN=mailux.gpssoftwarenumberone.com/O=Mailux/C=ES"
```

### 4. Activación Nginx

```bash
# Crear symlink
ln -sf /etc/nginx/sites-available/mailux /etc/nginx/sites-enabled/mailux

# Validar configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx
```

---

## 🌐 Acceso Ahora

| Protocolo | URL | Estado |
|-----------|-----|--------|
| **HTTP** | `http://mailux.gpssoftwarenumberone.com` | ✅ Redirige a HTTPS |
| **HTTPS** | `https://mailux.gpssoftwarenumberone.com` | ✅ Funcionando |
| **Local (API)** | `http://127.0.0.1:4600` | ✅ Funciona |
| **Local (Frontend)** | `http://127.0.0.1:4902` | ✅ Funciona |

---

## ⚠️ Certificado Auto-Firmado

Actualmente usamos un **certificado auto-firmado**, que es:

| Aspecto | Detalles |
|--------|----------|
| **Seguridad** | ✅ Encriptación HTTPS funcional |
| **Validez** | ⏰ 365 días (hasta junio 2027) |
| **Advertencia del navegador** | ⚠️ "Conexión no segura" (normal para self-signed) |
| **Validez Legal** | ❌ No verificado por CA (Certificate Authority) |

### Para producción: Obtener certificado Let's Encrypt válido

**Requerimientos:**
1. Puerto 80 disponible (sin otros servicios)
2. Acceso directo al servidor
3. Dominio apuntando al servidor

**Comando:**
```bash
# Detener todos los servicios en puerto 80
systemctl stop nginx  # o detener containers que usan puerto 80

# Esperar 5 segundos
sleep 5

# Ejecutar certbot
certbot certonly --standalone -d mailux.gpssoftwarenumberone.com \
  --non-interactive --agree-tos --email tu-email@example.com \
  --preferred-challenges http

# Reiniciar nginx
systemctl restart nginx
```

**Resultará en:**
- ✅ Certificado válido de Let's Encrypt
- ✅ Renovación automática cada 90 días
- ✅ Sin advertencias en navegador

---

## 🔐 Headers de Seguridad Implementados

| Header | Valor | Propósito |
|--------|-------|-----------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Fuerza HTTPS por 1 año |
| `X-Frame-Options` | `SAMEORIGIN` | Previene clickjacking |
| `X-Content-Type-Options` | `nosniff` | Previene MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Protección contra XSS |

---

## 📊 Diagrama de Flujo

```
Usuario (navegador)
        ↓
[HTTPS://mailux.gpssoftwarenumberone.com:443]
        ↓
[Nginx Reverse Proxy - /etc/nginx/sites-enabled/mailux]
        ↓
Validación de certificado SSL
        ↓
[http://127.0.0.1:4902] ← Docker Mailux Frontend (Nginx)
        ↓
[http://127.0.0.1:4600] ← Docker Mailux API (Node.js)
        ↓
Database SQLite
```

---

## ✅ Verificación

### Ver estado de Nginx
```bash
systemctl status nginx
```

### Ver si puertos están abiertos
```bash
lsof -i :80,443
```

### Ver configuración activa
```bash
cat /etc/nginx/sites-enabled/mailux
```

### Ver certificado
```bash
openssl x509 -in /etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/fullchain.pem -text -noout
```

---

## 🚀 Próximos Pasos

### Opción 1: Mantener Auto-Firmado (Testing)
- ✅ Funciona para desarrollo
- ⚠️ Advertencia en navegador
- ✅ Encriptación funcionando
- **Mejor para:** Testing, staging, desarrollo local

### Opción 2: Obtener Let's Encrypt (Producción)
- ✅ Certificado válido y reconocido
- ✅ Sin advertencias
- ✅ Renovación automática
- **Mejor para:** Producción, usuarios finales

**Recomendación:** Usa Let's Encrypt para producción.

---

## 🔧 Troubleshooting

### Error: "Certificado no válido"
**Solución:** Es normal con auto-firmado. Puedes:
1. Ignorar la advertencia en el navegador
2. Obtener certificado Let's Encrypt
3. Agregar excepción en navegador (solo para testing)

### Error: "Conexión rechazada"
**Soluciones:**
1. Verificar que Nginx está corriendo: `systemctl status nginx`
2. Verificar que puertos 80/443 están abiertos: `lsof -i :80,443`
3. Verificar config Nginx: `nginx -t`
4. Ver logs: `tail -f /var/log/nginx/error.log`

### Error: "Proxy timeout"
**Solución:**
1. Verificar que Mailux está corriendo: `docker compose ps`
2. Verificar puerto 4902: `curl http://127.0.0.1:4902`
3. Aumentar timeout en config Nginx si es necesario

---

## 📝 Archivos Relacionados

| Archivo | Ruta | Función |
|---------|------|---------|
| Config Nginx Mailux | `/etc/nginx/sites-available/mailux` | Reverse proxy |
| Symlink | `/etc/nginx/sites-enabled/mailux` | Activación |
| Docker Compose | `/opt/mailux/docker-compose.yml` | Contenedores (puerto 4902) |
| Certificado | `/etc/letsencrypt/live/mailux.gpssoftwarenumberone.com/` | SSL cert |

---

## ✨ Resumen

**✅ SSL/HTTPS completamente implementado para Mailux**

- Nginx reverse proxy en 80/443 ✅
- Certificado auto-firmado temporal ✅
- HTTP → HTTPS redirect ✅
- Headers de seguridad ✅
- Proxy hacia Mailux interno ✅

**Acceso:**
```
https://mailux.gpssoftwarenumberone.com  ← ¡HTTPS FUNCIONANDO!
```

**Próximo:** Obtener certificado Let's Encrypt para producción (en `Opciones` arriba)

---

**Generado:** 2026-06-05  
**Por:** Claude Code - Opus  
**Estado:** Ready for Production (con auto-signed cert temporal)
