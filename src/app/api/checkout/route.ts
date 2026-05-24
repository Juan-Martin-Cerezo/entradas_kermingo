import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = formData.get('email') as string;
    const quantityStr = formData.get('quantity') as string;
    const referralCode = formData.get('referralCode') as string | null;
    const receiptFile = formData.get('receipt') as File | null;
    const attendeeNamesStr = formData.get('attendeeNames') as string; // JSON array of names

    if (!email || !quantityStr || !receiptFile || !attendeeNamesStr) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
    }

    let attendeeNames: string[] = [];
    try {
      attendeeNames = JSON.parse(attendeeNamesStr);
      if (!Array.isArray(attendeeNames) || attendeeNames.length !== quantity) {
        return NextResponse.json({ error: 'Attendee names count must match quantity' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid attendee names format' }, { status: 400 });
    }

    // Dynamic promoter creation or association
    let promoterId: string | null = null;
    if (referralCode && referralCode.trim() !== '') {
      const code = referralCode.trim().toUpperCase();
      let promoter = await db.promoter.findUnique({
        where: { referral_code: code },
      });

      // If promoter does not exist, create dynamically on the fly
      if (!promoter) {
        promoter = await db.promoter.create({
          data: {
            name: code, // Set name equal to code for dynamic identification
            referral_code: code,
          },
        });
      }
      promoterId = promoter.id;
    }

    // Save receipt locally
    const bytes = await receiptFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${Date.now()}_${receiptFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = join(uploadsDir, filename);
    await writeFile(filePath, buffer);

    const receiptUrl = `/uploads/${filename}`;

    // Create Purchase
    const purchase = await db.purchase.create({
      data: {
        buyer_email: email,
        quantity,
        receipt_url: receiptUrl,
        payment_status: 'PENDING',
        promoter_id: promoterId,
        attendee_names: JSON.stringify(attendeeNames),
      },
    });

    return NextResponse.json({ success: true, purchaseId: purchase.id });
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
