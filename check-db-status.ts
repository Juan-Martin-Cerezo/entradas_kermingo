import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('./src/lib/db');
  try {
    // Attempt a query to see if the table exists
    await db.purchase.count();
    
    // Check if the promoter table exists and has records (optional)
    await db.promoter.count();
    
    // Check if subte monitor tables exist (which indicates an overwrite)
    const tables: any = await db.$queryRaw`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema='public' AND table_name IN ('HistoricalFlow', 'RouteSequence', 'Station');
    `;
    
    if (tables.length > 0) {
      console.error('ERROR: Database has been overwritten with subte-monitor tables!');
      process.exit(2);
    }

    console.log('Database integrity check passed.');
    process.exit(0);
  } catch (error: any) {
    console.error('DATABASE CHECK FAILED:', error.message || error);
    process.exit(1);
  }
}

main();
