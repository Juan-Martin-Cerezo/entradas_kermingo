import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let db: PrismaClient;

// Ensure we have a default connection string to prevent crash during Next.js build-time collection
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dummy_db';

if (process.env.NODE_ENV === 'production') {
  const pool = new pg.Pool({
    connectionString,
    max: 4, // Allow up to 4 concurrent connections per serverless container to handle parallel queries
    idleTimeoutMillis: 15000, // Keep idle connections alive for 15s to optimize subsequent page loads
    connectionTimeoutMillis: 30000, // 30s timeout to ensure Neon has enough time to wake up from auto-suspension (cold start)
  });
  const adapter = new PrismaPg(pool);
  db = new PrismaClient({ adapter });
} else {
  if (!globalForPrisma.prisma) {
    const pool = new pg.Pool({
      connectionString,
      max: 10, // Increase local pool limit
      idleTimeoutMillis: 30000, // Keep connections warm
      connectionTimeoutMillis: 30000, // 30s timeout to allow Neon to wake up
    });
    const adapter = new PrismaPg(pool);
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  }
  db = globalForPrisma.prisma;
}

export { db };
