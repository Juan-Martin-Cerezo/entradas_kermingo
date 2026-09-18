-- F1 Multi-Tenant Migration with Backfill for EventHub

-- 1. Create EventStatus enum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ON_SALE', 'CLOSED');

-- 2. Create Event table
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- 3. Create EventOwner table
CREATE TABLE "EventOwner" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "invite_token" TEXT,

    CONSTRAINT "EventOwner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventOwner_event_id_key" ON "EventOwner"("event_id");
CREATE UNIQUE INDEX "EventOwner_email_key" ON "EventOwner"("email");
CREATE UNIQUE INDEX "EventOwner_invite_token_key" ON "EventOwner"("invite_token");

ALTER TABLE "EventOwner" ADD CONSTRAINT "EventOwner_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create EventConfig table
CREATE TABLE "EventConfig" (
    "event_id" TEXT NOT NULL,
    "ticket_price_cents" INTEGER NOT NULL DEFAULT 500000,
    "referral_commission_cents" INTEGER NOT NULL DEFAULT 100000,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "pay_alias" TEXT,
    "contact_email" TEXT,
    "max_tickets" INTEGER,
    "logo_url" TEXT,

    CONSTRAINT "EventConfig_pkey" PRIMARY KEY ("event_id")
);

ALTER TABLE "EventConfig" ADD CONSTRAINT "EventConfig_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Seed initial event 'kermingo-2026' and its default config
INSERT INTO "Event" ("id", "slug", "name", "status", "createdAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'kermingo-2026', 'Kermingo 2026', 'ON_SALE', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "EventConfig" ("event_id", "ticket_price_cents", "referral_commission_cents", "currency", "pay_alias", "contact_email")
VALUES ('00000000-0000-0000-0000-000000000001', 500000, 100000, 'ARS', 'evento.kermingo', 'contacto@kermingo.com')
ON CONFLICT ("event_id") DO NOTHING;

-- 6. Add nullable event_id columns to existing tables
ALTER TABLE "Promoter" ADD COLUMN "event_id" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "event_id" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "event_id" TEXT;

-- 7. Backfill existing records to 'kermingo-2026'
UPDATE "Promoter"
SET "event_id" = '00000000-0000-0000-0000-000000000001'
WHERE "event_id" IS NULL;

UPDATE "Purchase"
SET "event_id" = '00000000-0000-0000-0000-000000000001'
WHERE "event_id" IS NULL;

UPDATE "Ticket"
SET "event_id" = COALESCE(
    (SELECT p."event_id" FROM "Purchase" p WHERE p."id" = "Ticket"."purchase_id"),
    '00000000-0000-0000-0000-000000000001'
)
WHERE "event_id" IS NULL;

-- 8. Enforce NOT NULL on event_id columns
ALTER TABLE "Promoter" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "event_id" SET NOT NULL;

-- 9. Update promoter unique constraint from referral_code to (event_id, referral_code)
DROP INDEX IF EXISTS "Promoter_referral_code_key";
CREATE UNIQUE INDEX "Promoter_event_id_referral_code_key" ON "Promoter"("event_id", "referral_code");

-- 10. Add foreign keys for tenant isolation and cascading
ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
