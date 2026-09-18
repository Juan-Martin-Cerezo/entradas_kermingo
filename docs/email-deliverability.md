# Entregabilidad de emails (por qué "no llegan" o caen en spam)

Diagnóstico en 3 pasos, del más barato al más profundo.

## 1. ¿El problema es configuración o entregabilidad?

```bash
curl -X POST https://<tu-app>/api/admin/test-email \
  -H "Content-Type: application/json" -b "<cookie de superadmin>" \
  -d '{"to":"tu-correo@gmail.com"}'
```

- **Falla con `code`** (`EAUTH`, `ETIMEDOUT`, `EENVELOPE`…) → problema de configuración SMTP, está en la respuesta y en `pistas`.
- **Responde `ok: true` con `accepted: ["tu@gmail.com"]`** → el servidor aceptó el mail. Si no aparece en la bandeja, es **entregabilidad**: el provider lo aceptó y el filtro del destinatario lo mandó a spam o lo descartó.

## 2. Las tres causas reales de spam

| Causa | Síntoma | Fix |
|---|---|---|
| **Remitente de un dominio que no controlás** (`noreply@eventhub.app`) | Spam o rechazo directo | Mandar siempre desde la cuenta autenticada (`SMTP_USER`) o desde un dominio propio verificado. El código hace fallback automático a `SMTP_USER`; se puede forzar con `MAIL_FROM_ADDRESS`. |
| **Falta SPF / DKIM / DMARC** en el dominio del remitente | Pasa a spam en Gmail/Outlook, sobre todo con adjuntos | Configurar los 3 registros DNS del proveedor (ver abajo). |
| **SMTP de cuenta personal (Gmail)** | Llega tarde, a spam, o Google corta el envío | Usar un proveedor transaccional (Resend/Brevo/SendGrid free tier) con dominio verificado. Gmail SMTP sólo sirve para pruebas: tiene límites diarios y su reputación no es de remitente transaccional. |

## 3. Configurar un dominio propio (el fix definitivo)

1. Comprá un dominio (o usá uno que ya tengas) y creá una cuenta en un proveedor transaccional (Resend free: 3.000 mails/mes).
2. En el proveedor, agregá el dominio y copiá los registros DNS:
   - **SPF**: `TXT @ "v=spf1 include:<proveedor> ~all"`
   - **DKIM**: `CNAME/TXT <selector>._domainkey ...` (lo da el proveedor)
   - **DMARC**: `TXT _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@tudominio"`
3. Seteá en el hosting:
   - `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` del proveedor
   - `MAIL_FROM_ADDRESS=entradas@tudominio.com`
   - `MAIL_REPLY_TO=tu-correo-real@tudominio.com` (a donde querés que contesten los compradores)
4. Verificá con el endpoint del paso 1 y con `https://www.mail-tester.com` (mandá un mail a la dirección que te da y mirá el score).

## Lo que ya hace el código

- **Nunca inventa un remitente**: usa `MAIL_FROM_ADDRESS` → `MAIL_FROM` → `SMTP_FROM` → `SMTP_USER`. Si el dominio no está verificado, sale desde la cuenta autenticada.
- **Multipart alternativo**: cada mail va con versión texto plano además del HTML (los filtros penalizan HTML-only).
- **`Reply-To`** con el email de contacto del evento, y **`List-Unsubscribe`** cuando hay contacto.
- **TLS correcto**: `secure` automático en 465, `requireTLS` en 587.
- **Timeouts** (15s conexión / 20s socket): un SMTP que no responde falla con error en vez de quedar colgado.
- **Log de cada envío** con `messageId`, `accepted`/`rejected` y, si falla, `code`/`command`/`response`.
