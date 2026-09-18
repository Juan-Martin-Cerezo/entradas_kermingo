# EventHub — Entradas Multi-Evento

Plataforma de venta de entradas + escaneo QR + panel de dueño para **N eventos de N dueños** sobre una sola instalación. Evolución de `entradas_kermingo` (single-event) a infra multi-tenant.

---

## 🛠️ Stack Tecnológico
- **Frontend/Backend:** Next.js 16 (App Router) con soporte Turbopack.
- **Base de Datos:** PostgreSQL en Supabase (tenant = fila con `event_id`, no DB por evento).
- **ORM:** Prisma Client.
- **Auth:** cookie firmada HS256 (`AUTH_SECRET`) con `{eventId, role}`; roles `superadmin` / `owner` / `scanner`; passwords de dueño con argon2id.
- **Envío de Correos:** Nodemailer (SMTP de plataforma, `reply-to` del dueño).
- **Comprobantes:** object storage (Cloudflare R2 o Vercel Blob) con fallback base64 en DB (`STORAGE_MODE`).
- **Control de Accesos:** lector QR integrado en cliente (HTML5-QRCode), offline-first por evento.

---

## 🗺️ Rutas

| Ruta | Qué es |
|---|---|
| `/` | Home: lista eventos `ON_SALE` |
| `/eventos` | Listado público de eventos |
| `/[slug]` | Compra de entradas del evento |
| `/[slug]/escaner` | Escáner QR del evento (owner/scanner) |
| `/[slug]/admin` | Panel del dueño (login scoped por evento) |
| `/api/events` | JSON de eventos a la venta |
| `/api/admin/platform-stats` | Stats por evento (solo superadmin) |
| `/api/keep-alive` | **Único** ping de keep-alive de la plataforma |

Rutas legacy (`/admin`, `/escaner`) redirigen 308 a `/kermingo-2026/...`.

---

## 🚀 Arquitectura y Optimizaciones del Sistema
Diseñado con foco en tolerancia a fallos, límites estrictos de almacenamiento y resiliencia en el día del evento.

### 1. Aislamiento multi-tenant
Todo query lleva `event_id` obligatorio (incluido el escáner: un ticket de otro evento responde `TICKET NOT FOUND`, nunca se quema). Tests de aislamiento en `src/__tests__/isolation.test.ts`.

### 2. Comprobantes fuera de Postgres
`receipt_url` es URL de object storage (R2/Blob) y el archivo se comprime en cliente (`compressImage`: JPEG calidad 60%, máx 1200px, 70-150KB). Fallback base64 detrás de `STORAGE_MODE=db|r2|blob`. Al rechazar/eliminar una compra se borra el objeto físico.

### 3. Cuotas anti-abuso por evento
Checkout limitado a 10 compras/hora por `(event_id, IP)` (429) y `EventConfig.max_tickets` cierra la venta sola (403). Tests en `src/__tests__/quotas.test.ts`.

### 4. Blindaje de Conexiones a PostgreSQL (Connection Pooler)
- **Problema:** en serverless, Vercel escala horizontalmente y satura el límite de conexiones.
- **Solución:** en `src/lib/db.ts` pool acotado por instancia serverless.

### 5. Keep-Alive único de plataforma
- **Problema:** Supabase/Neon suspende la DB tras inactividad; el primer escaneo sufre cold start.
- **Solución:** ruta `/api/keep-alive` con consulta ligera (`SELECT 1`).
- **Despliegue:** un solo ping cada 5 minutos a `https://<tu-app>.vercel.app/api/keep-alive` (ej. cron-job.org). **Ya no hay una URL por evento.**

### 6. Sistema de Validación QR Offline-First
- **Planilla Offline:** pre-carga de entradas aprobadas a `localStorage` con claves prefijadas por slug (`eh_<slug>_offline_db`).
- **Validación Local:** modo offline valida localmente y marca como usadas al instante.
- **Cola de Sincronización:** ingresos offline se suben en lote al recuperar red.

---

## 🔑 Variables de Entorno (.env)
Configura tu archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```bash
DATABASE_URL="postgresql://usuario:contraseña@servidor:puerto/bd?sslmode=require"
DIRECT_URL="postgresql://usuario:contraseña@servidor:puerto/bd?sslmode=require"
AUTH_SECRET="secreto-largo-aleatorio-para-firmar-cookies"
SUPERADMIN_EMAIL="admin@tudominio.com"
SUPERADMIN_PASSWORD="contraseña-fuerte-del-superadmin"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="tu-correo@gmail.com"
SMTP_PASS="tu-contraseña-de-aplicación"
SMTP_FROM='"EventHub" <tu-correo@gmail.com>'
STORAGE_MODE="db"
```

`ADMIN_PASSWORD` legacy se mantiene solo como fallback de compatibilidad.

---

## 💻 Desarrollo Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Generar el cliente de Prisma (**sin credenciales de producción nunca corras `db push`/`migrate` contra la DB real**; solo `generate` + migraciones como archivos SQL en `prisma/migrations/`):
   ```bash
   npx prisma generate
   ```

3. Correr el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Tests y lint:
   ```bash
   npx vitest run
   npm run lint
   ```

5. Compilar en producción:
   ```bash
   npm run build
   ```
