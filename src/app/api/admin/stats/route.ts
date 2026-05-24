import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await db.purchase.findMany();

    let approvedTickets = 0;
    let pendingTickets = 0;
    let rejectedTickets = 0;
    let approvedPurchasesCount = 0;
    let pendingPurchasesCount = 0;
    let rejectedPurchasesCount = 0;

    purchases.forEach((p) => {
      if (p.payment_status === 'APPROVED') {
        approvedTickets += p.quantity;
        approvedPurchasesCount++;
      } else if (p.payment_status === 'PENDING') {
        pendingTickets += p.quantity;
        pendingPurchasesCount++;
      } else if (p.payment_status === 'REJECTED') {
        rejectedTickets += p.quantity;
        rejectedPurchasesCount++;
      }
    });

    const totalEarnings = approvedTickets * 5500;

    return NextResponse.json({
      approvedTickets,
      pendingTickets,
      rejectedTickets,
      approvedPurchasesCount,
      pendingPurchasesCount,
      rejectedPurchasesCount,
      totalEarnings,
    });
  } catch (error: any) {
    console.error('Fetch stats error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
