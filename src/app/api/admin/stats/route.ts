import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { TICKET_PRICE } from '@/lib/constants';

export async function GET(req: Request) {
  try {
    const isAuthorized = await checkAuth();
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await db.purchase.findMany({
      select: {
        quantity: true,
        payment_status: true,
      },
    });

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

    const totalEarnings = approvedTickets * TICKET_PRICE;

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
