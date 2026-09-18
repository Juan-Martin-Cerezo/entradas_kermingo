import dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🔄 Starting Database Restoration from Local JSON Backup...');
  const { db } = await import('./src/lib/db');

  // Multi-tenant: este script restaura en UN evento (override con EVENT_SLUG).
  const targetSlug = process.env.EVENT_SLUG || 'kermingo-2026';

  try {
    const targetEvent = await db.event.findUnique({ where: { slug: targetSlug }, select: { id: true } });
    if (!targetEvent) {
      console.error(`Error: evento '${targetSlug}' no existe. Corré el seed o pasá EVENT_SLUG.`);
      return;
    }
    const eventId = targetEvent.id;
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      console.error('Error: No backups directory found.');
      return;
    }

    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.error('Error: No backup JSON files found.');
      return;
    }

    // Sort files to get the latest backup
    files.sort((a, b) => b.localeCompare(a));
    const latestBackupFile = path.join(backupDir, files[0]);
    console.log(`Reading backup file: ${latestBackupFile}`);

    const backupContent = fs.readFileSync(latestBackupFile, 'utf-8');
    const backupData = JSON.parse(backupContent);

    console.log('Restoring data...');
    await db.$transaction(async (tx) => {
      // Clear existing records
      await tx.ticket.deleteMany({});
      await tx.purchase.deleteMany({});
      await tx.promoter.deleteMany({});

      // Restore Promoters
      console.log(`Restoring ${backupData.promoters.length} promoters...`);
      for (const promoter of backupData.promoters) {
        await tx.promoter.create({
          data: {
            id: promoter.id,
            event_id: promoter.event_id ?? eventId,
            name: promoter.name,
            referral_code: promoter.referral_code,
          }
        });
      }

      // Restore Purchases and Tickets
      console.log(`Restoring ${backupData.purchases.length} purchases...`);
      for (const purchase of backupData.purchases) {
        const { tickets, promoter, ...purchaseFields } = purchase;
        
        await tx.purchase.create({
          data: {
            ...purchaseFields,
            event_id: purchaseFields.event_id ?? eventId,
            createdAt: new Date(purchaseFields.createdAt)
          }
        });

        for (const ticket of tickets) {
          const { purchase: tPurchase, ...ticketFields } = ticket;
          await tx.ticket.create({
            data: {
              ...ticketFields,
              event_id: ticketFields.event_id ?? eventId,
              entry_date: ticketFields.entry_date ? new Date(ticketFields.entry_date) : null
            }
          });
        }
      }
    });

    console.log('🎉 Database successfully restored from local backup!');
  } catch (error) {
    console.error('Failed to restore from backup:', error);
  }
}

main();
