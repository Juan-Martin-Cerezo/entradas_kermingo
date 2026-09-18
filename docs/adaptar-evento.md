# Adaptar EventHub a otro evento (sin tocar código)

Adaptar la plataforma a un evento nuevo es **configuración, no código**: se crea
un `Event` con su `EventConfig` y todo lo demás (precio, moneda, alias, emails,
escáner, promoters) deriva de ahí. Nada está hardcodeado por marca.

## Qué se configura por evento

| Campo (`EventConfig` / `Event`) | Dónde se usa | Cómo cambiarlo |
|---|---|---|
| `name`, `slug` | URLs (`/[slug]`), home, emails, metadata | Al crear el evento en `/panel` (slug único, minúsculas-números-guiones) |
| `status` (`DRAFT`/`ON_SALE`/`CLOSED`) | Visibilidad en `/` y apertura de venta | Toggle en `/panel` o PATCH `/api/admin/events` |
| `ticket_price_cents` (entero en centavos) | Página de compra, stats, recaudación (`src/lib/pricing.ts`) | Formulario del evento en `/panel` |
| `referral_commission_cents` | Cálculo de comisión de promoters | Formulario del evento en `/panel` |
| `currency` (ej. `ARS`, `USD`, `UYU`) | Formato de montos y stats | Formulario del evento en `/panel` |
| `pay_alias` | Instrucciones de pago en `/[slug]` y emails | Formulario del evento en `/panel` |
| `contact_email` | `reply-to` de todos los emails del evento (`src/lib/mailer/`) | Formulario del evento en `/panel` |
| `logo_url` | Branding en emails | Formulario del evento en `/panel` |
| `max_tickets` (nullable) | Cuota: al superarla, el checkout devuelve 403 y la venta se cierra sola | Formulario del evento en `/panel` |
| Promoters + `referral_code` | Links `?[ref=CODIGO]`, ranking, comisiones | Alta/edición/baja en `/[slug]/admin/referidos` (códigos únicos **por evento**: el mismo código puede existir en dos eventos) |

## Campos personalizados por evento (ej. preferencias alimentarias, DNI, talle)

El checkout acepta campos libres además de los fijos:

- `attendeeNames` (JSON, obligatorio): un nombre por entrada.
- `dietaryPreferences` (texto libre, opcional): se guarda en `Purchase.dietary_preferences` y se muestra en la tabla de asistentes (`/[slug]/admin/asistentes`).

Para pedir otro dato (ej. DNI o teléfono), el front de `/[slug]` lo agrega como
campo del `FormData` y el checkout lo persiste en la columna correspondiente de
`Purchase` — sin cambiar el schema multi-tenant ni tocar otros eventos.

## Seed demo genérico

`prisma/seed.ts` crea **dos** eventos demo sin marca real:

- `demo-festival` (`ON_SALE`, $5000 ARS, alias `demo.festival.pagos`)
- `demo-conferencia` (`DRAFT`, $10000 ARS, `max_tickets: 500`)

Todos los valores se pueden pisar por entorno (`SEED_EVENT_A_SLUG`,
`SEED_EVENT_A_PRICE_CENTS`, `SEED_EVENT_B_MAX_TICKETS`, etc.). Ver
`.env.example`. El test `src/__tests__/adaptability.test.ts` levanta ambos en
la misma base (mockeada) y verifica que precio, stats y promoters no se cruzan.
