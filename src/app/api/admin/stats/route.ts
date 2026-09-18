import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { getEventPricing } from '@/lib/pricing';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pricing = await getEventPricing(eventId);

    const purchases = await db.purchase.findMany({
      where: { event_id: eventId },
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

    const totalEarningsCents = approvedTickets * pricing.ticketPriceCents;

    return NextResponse.json({
      approvedTickets,
      pendingTickets,
      rejectedTickets,
      approvedPurchasesCount,
      pendingPurchasesCount,
      rejectedPurchasesCount,
      totalEarningsCents,
      ticketPriceCents: pricing.ticketPriceCents,
      currency: pricing.currency,
    });
  } catch (error: any) {
    console.error('Fetch stats error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
