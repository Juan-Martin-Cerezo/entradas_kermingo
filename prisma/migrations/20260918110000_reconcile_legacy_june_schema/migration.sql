-- Reconciliación con el prototipo multi-tenant de junio/2026 que vivía en esta misma base.
--
-- Estado verificado ANTES de aplicar (2026-09-18, vía MCP supabase):
--   Organization 3 filas, User 3, Event 3 (todos seed: "Campamento Scout 2026", "Pollada 2026",
--   "Feria de Ciencias"), Promoter 6, Purchase 0, Ticket 0.
-- No hay transacciones reales que preservar: cero compras, cero tickets, evento Kermingo ya pasado.
-- Decisión de Juan (2026-09-18): el schema de este repo gana; se borra el prototipo de junio.
--
-- Esta migración corre ANTES de 20260918120000_f1_multitenant_backfill (timestamp menor) y la deja
-- aplicable. En una base nueva es no-op (todo con IF EXISTS).

-- 1) Soltar las FKs que apuntan a las tablas legacy
ALTER TABLE "Promoter" DROP CONSTRAINT IF EXISTS "Promoter_eventId_fkey";
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_eventId_fkey";
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_eventId_fkey";

-- 2) Limpiar el seed que referencia eventos de junio (orden: hijos -> padres)
DELETE FROM "Ticket";
DELETE FROM "Purchase";
DELETE FROM "Promoter";

-- 3) camelCase (prototipo junio) -> snake_case (convención de los modelos Prisma de este repo)
ALTER TABLE "Promoter" RENAME COLUMN "eventId" TO "event_id";
ALTER TABLE "Purchase" RENAME COLUMN "eventId" TO "event_id";
ALTER TABLE "Ticket" RENAME COLUMN "eventId" TO "event_id";

-- 4) Índices legacy con nombres camelCase
DROP INDEX IF EXISTS "Promoter_eventId_referral_code_key";
DROP INDEX IF EXISTS "Purchase_eventId_idx";

-- 5) Borrar el schema legacy (Organization / User / Event de junio)
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_organizationId_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_organizationId_fkey";
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS "Organization";
DROP TABLE IF EXISTS "Event";

-- NOTA: "Ticket"."hmac_signature" (text, nullable) se conserva a propósito: es la base para firmar
-- los QR con HMAC, la mejor idea del intento de junio. Prisma ignora columnas que no declara.
