# EventHub — de `entradas_kermingo` a infra multi-evento multi-dueño

> **Para el PM (Antigravity CLI) y el contributor (Command Code):** tablero Notion = `EventHub Tasks`
> `3dfb8e8b-1951-8115-8ec3-cf79edb415c9` (bajo page `EventHub — Entradas Multi-Evento`, Second Brain).
> Una task = un PR. Criterio de aceptación explícito por task. Verificación real (git + query Notion), nunca self-report.

**Goal:** mismo producto (venta de entradas + escaneo QR + panel de dueño), pero N eventos de N dueños distintos sobre
una sola instalación, con aislamiento real de datos, auth por evento y onboarding de dueños.

**Stack actual:** Next.js 16.2.6 (App Router) · Prisma 7.8 + PostgreSQL **Supabase** (`wodzuelvlqontlthdlig`) ·
Nodemailer/SMTP · Vercel serverless · vitest. ~1.4k LOC.

**Estado hoy (recon 2026-09-18):** todo single-event hardcodeado. Bloqueantes:

| Bloqueante | Dónde |
|---|---|
| Sin entidad Evento/Dueño. Todo es global | `prisma/schema.prisma` (Promoter, Purchase, Ticket) |
| Auth = un único `ADMIN_PASSWORD` en env; cookie `admin_session` = sha256(password) | `src/lib/auth.ts`, `src/app/api/admin/login/route.ts`, `src/proxy.ts` |
| Precio y comisión de referidos en código | `src/lib/constants.ts` |
| `Promoter.referral_code` `@unique` **global** → dos eventos no pueden repetir código | `prisma/schema.prisma:15` |
| Nombre/branding/alias hardcodeados ("Kermingo 2026", `evento.kermingo`) | `src/lib/mailer.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, 3 páginas admin, `escaner/page.tsx` |
| localStorage del escáner con claves fijas (`kermingo_offline_db`) → dos eventos se pisan en el mismo celular | `src/app/escaner/page.tsx` |
| Comprobantes base64 dentro de Postgres (`receipt_url` = `data:image/...`) | `src/app/api/checkout/route.ts:63-68`, `admin/purchases/receipt` |
| Guard de DB por substring: bloquea cualquier DB que no sea la de Kermingo | `prisma.config.ts:10` |
| Cero scoping: `stats`/`purchases`/`asistentes`/`validate`/`action` consultan todo | `src/app/api/**` |
| Rutas en la raíz: `/`, `/admin`, `/escaner` (un solo evento) | `src/app/**` |

## Arquitectura objetivo — 5 decisiones y su porqué

1. **Tenant = fila, no DB.** Tabla `Event` + `event_id` en `Purchase`, `Ticket`, `Promoter` (+ `EventConfig`).
   *Descartado:* DB-por-evento. Con Supabase free (500MB, 2 proyectos) y Prisma, DB por evento = N migraciones
   desincronizadas y N connection strings a mano. Cero beneficio real a esta escala.
2. **Rutas por slug:** `/[slug]` (compra), `/[slug]/escaner`, `/[slug]/admin`, `/[slug]/registro`.
   *Descartado por ahora:* subdominio por evento (`evento.eventhub.app`) — requiere wildcard DNS + dominio por
   evento en Vercel y complica cookies/CORS. Se puede agregar después con un `rewrite` en `proxy.ts` sin tocar datos.
3. **Auth de verdad:** cookie firmada (JWT HS256, `AUTH_SECRET`) con `{eventId, role}`; roles `superadmin`
   (plataforma/Juan), `owner` (dueño del evento), `scanner` (solo check-in). Password del dueño hasheada con
   **argon2id** en DB. Muere el `ADMIN_PASSWORD` global y el token = sha256 de la password (hoy cualquiera que lea
   una cookie de un evento puede entrar a otro si comparte password).
4. **Comprobantes fuera de Postgres.** `receipt_url` pasa a URL de object storage (Cloudflare R2 free 10GB o Vercel
   Blob) y se guarda el archivo comprimido en cliente (ya existe `compressImage`). *Por qué:* base64 en tabla =
   70-150KB por fila (≈3.5k pedidos = 500MB). Con 10 eventos eso explota en el primer mes. `ponytail:` fallback
   base64 se queda detrás de un flag `STORAGE_MODE=db|r2` para no romper el deploy si R2 no está configurado.
5. **Aislamiento explícito en todo query.** `event_id` obligatorio, incluido el escáner: un ticket de otro evento
   debe responder `TICKET NOT FOUND`/`RECHAZADO`, nunca quemarse. Tests de aislamiento = criterio de aceptación, no
   opcional.

**Modelo de datos propuesto (resumen):**

```prisma
model Event {
  id        String   @id @default(uuid())
  slug      String   @unique
  name      String
  status    EventStatus @default(DRAFT)   // DRAFT | ON_SALE | CLOSED
  owner     EventOwner?
  config    EventConfig?
  purchases Purchase[]
  tickets   Ticket[]
  promoters Promoter[]
  createdAt DateTime @default(now())
}

model EventOwner {                 // login del dueño
  id           String  @id @default(uuid())
  event_id     String  @unique
  email        String  @unique
  password_hash String               // argon2id
  invite_token String? @unique       // un solo uso
}

model EventConfig {                // lo que hoy está en constants.ts + branding
  event_id      String  @id
  ticket_price_cents    Int     @default(500000)
  referral_commission_cents Int @default(100000)
  currency      String  @default("ARS")
  pay_alias     String?
  contact_email String?
  max_tickets   Int?                 // cuota anti-abuso
  logo_url      String?
}
```

`Purchase.event_id`, `Ticket.event_id` (denormalizado: el escáner valida sin join) y `Promoter.@unique([event_id, referral_code])`.

## Fases y tasks (espejo del tablero Notion)

**F0 — Baseline (Junior, S).** `npm ci && npx vitest run && npm run build` verde + tag `v1.0-single-event`.
Sin esto no hay red de seguridad para lo que viene.

**F1 — Modelo multi-tenant (PM + Junior, M).**
- Schema `Event`/`EventOwner`/`EventConfig` + `event_id` (PM).
- Migración con backfill: crear evento `kermingo-2026` y ligar las filas existentes; `event_id` arranca nullable →
  backfill → `NOT NULL`. **Backup previo obligatorio:** `npx tsx backup-db.ts` (regla del repo).
- `constants.ts` → `EventConfig` en centavos (Junior).
- Scoping por `event_id` en `stats`, `purchases`, `purchases/receipt`, `asistentes`, `action`, `validate` (Junior).
- `@unique([event_id, referral_code])` + alta de promoter desde checkout scoped (Junior).
- `prisma.config.ts`: reemplazar el substring `wodzuelvlqontlthdlig` por guard explícito
  (`ALLOW_DB_PUSH=1` + allowlist de project refs) para poder crear DB de staging/test (Junior).
- **Aceptación F1:** test `isolation.test.ts` con 2 eventos: compra en A invisible desde stats de B; validar ticket
  de A en escáner de B = rechazo; mismo `referral_code` en ambos eventos funciona.

**F2 — Auth multi-rol (PM, L).** Cookie firmada `{eventId, role, exp}`, argon2id, `checkAuth(eventId, roles[])` en vez
de `checkAuth()`. `proxy.ts` valida rol por ruta (`/[slug]/admin/**` → owner|superadmin; `/[slug]/escaner/**` →
owner|scanner). Login por slug: `POST /api/[slug]/login`. Scanner como rol propio = link de un solo uso, sin exponer
el panel de aprobaciones. **Aceptación:** owner de A con cookie válida → 403 en `/b/admin`; `/api/auth` no filtra
otro evento.

**F3 — Ruteo por slug (Junior, M).** `src/app/page.tsx` → `src/app/[slug]/page.tsx`; admin/escaner bajo `[slug]`;
APIs a `/api/[slug]/**`; middleware con slug; claves de localStorage con prefijo `eh_<slug>_offline_db`. Rutas viejas
(`/admin`, `/escaner`) redirigen 308 a `/kermingo-2026/...`. **Aceptación:** flujo completo de compra + escaneo en
`/kermingo-2026` sin regresión; `/` lista eventos o redirige.

**F4 — Branding/templado (Junior, M).** `mailer.ts` recibe `Event` (nombre, alias, contacto, reply-to) y plantillas;
cero strings "Kermingo" hardcodeados (`grep -ri kermingo src/` = 0 fuera del seed). `layout.tsx` metadata por evento.
**Aceptación:** email de un evento de prueba sale con su nombre y alias.

**F5 — Comprobantes en object storage (PM, L).** Upload a R2/Blob con `STORAGE_MODE`, borrado del objeto al rechazar o
eliminar compra, URL firmada para el dueño. **Aceptación:** `receipt_url` no empieza con `data:`; archivo borrado
cuando se borra la compra; peso de tabla estable.

**F6 — Onboarding de dueño (PM, M).** superadmin crea evento + invita por email con token de un solo uso (24h) →
dueño setea password → queda `owner`. **Aceptación:** token usado 2 veces falla; dueño sin invitación no puede
reclamar un evento ajeno.

**F7 — Cuotas y abuso (Junior, M).** Rate limit por evento/IP en checkout (ej. 10 compras/hora, `max_tickets`),
validación de tamaño/typo ya existente, y límite de eventos activos por dueño. **Aceptación:** 11ª compra en la hora →
429 con mensaje claro; al llegar a `max_tickets` la venta pública se cierra sola.

**F8 — Plataforma (Junior, M).** `/eventos` listado, stats por evento, `/api/keep-alive` único (hoy hay que apuntar
cron-job.org a una sola URL), README reescrito y `.env.example` actualizado (`AUTH_SECRET`, `STORAGE_*`, `SUPERADMIN_*`).

## Archivos que van a cambiar

```
prisma/schema.prisma              +Event +EventOwner +EventConfig, event_id en 3 modelos, unique compuesto
prisma/migrations/**              nueva migración con backfill (RENAME/ADD COLUMN NULLABLE → UPDATE → SET NOT NULL)
prisma/seed.ts                    Kermingo como primer evento + superadmin
prisma.config.ts                  reemplaza el guard por substring
src/lib/auth.ts                   checkAuth(eventId, roles) + argon2 + JWT firma/verify
src/lib/session.ts      (nuevo)   sign/verify cookie, getSession(req)
src/lib/event.ts        (nuevo)   getEventBySlug, assertEventAccess
src/lib/constants.ts              queda solo con límites de archivo; precio/comisión → DB
src/lib/mailer.ts                 → src/lib/mailer/{index.ts,templates.ts} con datos del evento
src/lib/rate-limit.ts   (nuevo)   ventana deslizante en tabla/Upstash (decidir en F7)
src/proxy.ts                      matcher [slug] + roles por ruta
src/app/page.tsx                  → src/app/[slug]/page.tsx
src/app/escaner/page.tsx          → src/app/[slug]/escaner/page.tsx (+ localStorage prefijado)
src/app/admin/**                  → src/app/[slug]/admin/**, login scoped
src/app/eventos/page.tsx (nuevo)  listado público
src/app/api/**                    → src/app/api/[slug]/**
src/__tests__/isolation.test.ts   (nuevo) aislamiento entre 2 eventos
```

## Riesgos / cosas a decidir por Juan

1. **Migración de datos en producción.** `kermingo-2026` ya vendió entradas. La migración toca la tabla viva:
   backup JSON → migración → verificación con `check-db-status.ts`. Ventana: fuera de horario de venta.
2. **Marca del producto.** ¿"EventHub" como nombre público o queda como herramienta interna sin marca? Afecta
   dominio/DNS y README.
3. **Plata vs dueño.** ¿Los dueños traen su propia cuenta SMTP o todo sale del SMTP de Juan con `reply-to` del dueño
   (más simple, pero Juan carga con reputación de envío y bounces)? Propuesto: SMTP de plataforma en F1-F6, SMTP por
   evento como F9 opcional.
4. **Cobro.** MP está descartado (Juan es menor). Sigue siendo comprobante + aprobación manual. Con dueños externos,
   ¿quién cobra? Si el dinero entra a la cuenta del dueño, la plataforma solo administra; si Juan cobra, necesita
   poder facturar. **Esto define si EventHub es SaaS o herramienta compartida — decidir antes de F6.**
5. **Responsabilidad legal de datos.** Con dueños externos, Juan pasa a ser responsable de datos de terceros (DNI no,
   pero emails y comprobantes sí). Ley 25.326 Argentina: datos personales → aviso de privacidad mínimo y borrado a
   pedido. `ponytail:` F8 alcanza con página de términos + endpoint de borrado por email.
6. **Subdominios** (F9) y **pagos online** (F9+) quedan fuera de alcance hasta cerrar F1-F8.

## Delegación

| Rol | Agente | Modelo | Alcance |
|---|---|---|---|
| PM | Antigravity CLI (G15) | Gemini 3.8 Flash, effort medium | F1 schema, F2 auth, F5 storage, F6 onboarding, review de todos los PRs |
| Contributor | Command Code (G15) | muse-spark-1.3 | F0, F1 constants/scoping/promoter/guard, F3 ruteo, F4 mailer, F7 cuotas, F8 plataforma |
| PM de cabecera / verificación | Hermes (Pi) | DeepSeek V4 Flash | Dispara, verifica (git log, query Notion, tests), cierra tasks |

Protocolo: `~/ia-memoria/orquestacion.md`. Tasks: una por PR, estado `En progreso` al arrancar, `Review` al terminar.
Verificación de Hermes: `git log/diff` en G15 + query real de la DB Notion — nunca el self-report del agente.
