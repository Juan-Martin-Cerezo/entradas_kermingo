import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const isAuthorized = await checkAuth();
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Retrieve purchases, excluding the heavy receipt_url to save bandwidth and memory
    const purchases = await db.purchase.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        buyer_email: true,
        quantity: true,
        payment_status: true,
        attendee_names: true,
        email_sent: true,
        createdAt: true,
        promoter: {
          select: {
            id: true,
            name: true,
            referral_code: true,
          },
        },
      },
    });

    return NextResponse.json(purchases);
  } catch (error: any) {
    console.error('Fetch purchases error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
