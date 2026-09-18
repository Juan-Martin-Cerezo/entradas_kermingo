import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://scout_admin:scout_password_secreta@localhost:5432/scout_manager_db?schema=public';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface DemoEventSeed {
  id: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'ON_SALE' | 'CLOSED';
  ticketPriceCents: number;
  referralCommissionCents: number;
  currency: string;
  payAlias: string | null;
  contactEmail: string | null;
  maxTickets: number | null;
  promoters: Array<{ name: string; referral_code: string }>;
}

const DEMO_EVENTS: DemoEventSeed[] = [
  {
    id: process.env.SEED_EVENT_A_ID || '00000000-0000-0000-0000-000000000001',
    slug: process.env.SEED_EVENT_A_SLUG || 'demo-festival',
    name: process.env.SEED_EVENT_A_NAME || 'Demo Festival',
    status: 'ON_SALE',
    ticketPriceCents: Number(process.env.SEED_EVENT_A_PRICE_CENTS || 500000),
    referralCommissionCents: Number(process.env.SEED_EVENT_A_COMMISSION_CENTS || 100000),
    currency: process.env.SEED_EVENT_A_CURRENCY || 'ARS',
    payAlias: process.env.SEED_EVENT_A_PAY_ALIAS || 'demo.festival.pagos',
    contactEmail: process.env.SEED_EVENT_A_CONTACT || 'hola@demo-festival.ejemplo',
    maxTickets: process.env.SEED_EVENT_A_MAX_TICKETS ? Number(process.env.SEED_EVENT_A_MAX_TICKETS) : null,
    promoters: [
      { name: 'Promotora Ejemplo', referral_code: 'PROMO10' },
      { name: 'Embajador Demo', referral_code: 'EMBAJADOR' },
    ],
  },
  {
    id: process.env.SEED_EVENT_B_ID || '00000000-0000-0000-0000-000000000002',
    slug: process.env.SEED_EVENT_B_SLUG || 'demo-conferencia',
    name: process.env.SEED_EVENT_B_NAME || 'Demo Conferencia',
    status: 'DRAFT',
    ticketPriceCents: Number(process.env.SEED_EVENT_B_PRICE_CENTS || 1000000),
    referralCommissionCents: Number(process.env.SEED_EVENT_B_COMMISSION_CENTS || 200000),
    currency: process.env.SEED_EVENT_B_CURRENCY || 'ARS',
    payAlias: process.env.SEED_EVENT_B_PAY_ALIAS || 'demo.conferencia.pagos',
    contactEmail: process.env.SEED_EVENT_B_CONTACT || 'hola@demo-conferencia.ejemplo',
    maxTickets: process.env.SEED_EVENT_B_MAX_TICKETS ? Number(process.env.SEED_EVENT_B_MAX_TICKETS) : 500,
    promoters: [
      { name: 'Difusor Ejemplo', referral_code: 'DIFUSION' },
    ],
  },
];

async function seedDemoEvent(demo: DemoEventSeed) {
  const event = await prisma.event.upsert({
    where: { slug: demo.slug },
    update: {},
    create: {
      id: demo.id,
      slug: demo.slug,
      name: demo.name,
      status: demo.status,
      config: {
        create: {
          ticket_price_cents: demo.ticketPriceCents,
          referral_commission_cents: demo.referralCommissionCents,
          currency: demo.currency,
          pay_alias: demo.payAlias,
          contact_email: demo.contactEmail,
          max_tickets: demo.maxTickets,
        },
      },
    },
  });

  for (const promoter of demo.promoters) {
    await prisma.promoter.upsert({
      where: {
        event_id_referral_code: {
          event_id: event.id,
          referral_code: promoter.referral_code,
        },
      },
      update: {},
      create: {
        ...promoter,
        event_id: event.id,
      },
    });
  }

  return event;
}

async function main() {
  for (const demo of DEMO_EVENTS) {
    const event = await seedDemoEvent(demo);
    console.log(`Seed OK: ${event.slug} (${event.name})`);
  }
  console.log('Database seeded successfully with generic demo events (no real brand).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
