import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://scout_admin:scout_password_secreta@localhost:5432/scout_manager_db?schema=public';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const promoters = [
    { name: 'Lionel Messi', referral_code: 'MESSI10' },
    { name: 'Lionel Scaloni', referral_code: 'SCALONETA' },
    { name: 'Emiliano Martinez', referral_code: 'DIBU23' },
  ];

  for (const promoter of promoters) {
    await prisma.promoter.upsert({
      where: { referral_code: promoter.referral_code },
      update: {},
      create: promoter,
    });
  }

  console.log('Database seeded successfully with default promoters.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
