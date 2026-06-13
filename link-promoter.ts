import dotenv from 'dotenv';
dotenv.config();
import { execSync } from 'child_process';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: npx tsx link-promoter.ts <buyer_email> <referral_code>');
    console.log('Example: npx tsx link-promoter.ts veroandamio@gmail.com DIBU23');
    return;
  }

  const [buyerEmail, referralCode] = args;
  const code = referralCode.trim().toUpperCase();

  const { db } = await import('./src/lib/db');

  console.log(`Linking purchase from ${buyerEmail} to promoter code ${code}...`);

  try {
    // 1. Find the purchase
    const purchase = await db.purchase.findFirst({
      where: { buyer_email: buyerEmail },
    });

    if (!purchase) {
      console.error(`Error: No purchase found for buyer email ${buyerEmail}`);
      return;
    }

    // 2. Find or create the promoter
    let promoter = await db.promoter.findUnique({
      where: { referral_code: code },
    });

    if (!promoter) {
      console.log(`Promoter with code ${code} does not exist. Creating dynamically...`);
      promoter = await db.promoter.create({
        data: {
          name: code,
          referral_code: code,
        },
      });
      console.log(`✓ Promoter ${code} created.`);
    }

    // 3. Update the purchase
    await db.purchase.update({
      where: { id: purchase.id },
      data: { promoter_id: promoter.id },
    });

    console.log(`🎉 Success! Linked purchase ${purchase.id} (${buyerEmail}) to promoter ${promoter.name} (${code}).`);
    
    // 4. Automatically trigger a backup to save this association!
    console.log('Running backup to save changes...');
    execSync('npx tsx backup-db.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to link promoter:', error);
  }
}

main();
