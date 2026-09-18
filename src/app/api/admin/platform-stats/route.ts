import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export async function GET() {
  try {
    const isAuthorized = await checkAuth(undefined, ['superadmin']);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const events = await db.event.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, slug: true, name: true, status: true, createdAt: true },
    });

    const groups = await db.purchase.groupBy({
      by: ['event_id', 'payment_status'],
      _sum: { quantity: true },
      _count: true,
    });

    const perEvent = new Map<
      string,
      { approvedTickets: number; pendingTickets: number; approvedPurchases: number; pendingPurchases: number }
    >();

    for (const g of groups) {
      const entry =
        perEvent.get(g.event_id) ??
        { approvedTickets: 0, pendingTickets: 0, approvedPurchases: 0, pendingPurchases: 0 };
      if (g.payment_status === 'APPROVED') {
        entry.approvedTickets += g._sum.quantity ?? 0;
        entry.approvedPurchases += g._count;
      } else if (g.payment_status === 'PENDING') {
        entry.pendingTickets += g._sum.quantity ?? 0;
        entry.pendingPurchases += g._count;
      }
      perEvent.set(g.event_id, entry);
    }

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        slug: event.slug,
        name: event.name,
        status: event.status,
        createdAt: event.createdAt,
        ...(perEvent.get(event.id) ?? {
          approvedTickets: 0,
          pendingTickets: 0,
          approvedPurchases: 0,
          pendingPurchases: 0,
        }),
      })),
    });
  } catch (error: unknown) {
    console.error('Platform stats error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
