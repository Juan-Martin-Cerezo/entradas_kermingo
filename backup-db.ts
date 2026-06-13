import dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('📦 Starting Database Backup...');
  const { db } = await import('./src/lib/db');
  try {
    const purchases = await db.purchase.findMany({
      include: {
        tickets: true,
        promoter: true,
      }
    });

    const promoters = await db.promoter.findMany();

    const backupData = {
      timestamp: new Date().toISOString(),
      purchases,
      promoters,
    };

    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(backupDir, `backup-${dateStr}.json`);
    
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    
    console.log(`✓ Backup successfully saved to: ${backupFilePath}`);
    console.log(`- Backed up ${purchases.length} purchases.`);
    console.log(`- Backed up ${promoters.length} promoters.`);
  } catch (error) {
    console.error('Failed to create backup:', error);
  }
}

main();
