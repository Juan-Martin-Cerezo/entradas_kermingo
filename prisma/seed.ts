import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://scout_admin:scout_password_secreta@localhost:5432/scout_manager_db?schema=public';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const event = await prisma.event.upsert({
    where: { slug: 'kermingo-2026' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'kermingo-2026',
      name: 'Kermingo 2026',
      status: 'ON_SALE',
      config: {
        create: {
          ticket_price_cents: 500000,
          referral_commission_cents: 100000,
          currency: 'ARS',
          pay_alias: 'evento.kermingo',
          contact_email: 'contacto@kermingo.com',
        },
      },
    },
  });

  const promoters = [
    { name: 'Lionel Messi', referral_code: 'MESSI10' },
    { name: 'Lionel Scaloni', referral_code: 'SCALONETA' },
    { name: 'Emiliano Martinez', referral_code: 'DIBU23' },
  ];

  for (const promoter of promoters) {
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

  console.log('Database seeded successfully with Kermingo 2026 and default promoters.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
