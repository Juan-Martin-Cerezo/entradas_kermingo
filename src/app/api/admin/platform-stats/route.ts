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
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        createdAt: true,
        config: true,
        owner: {
          select: {
            id: true,
            email: true,
            invite_token: true,
          },
        },
      },
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

    interface TicketGroupEntry {
      event_id: string;
      entry_status: boolean;
      _count?: number | { _all?: number; id?: number };
    }

    let ticketGroups: TicketGroupEntry[] = [];
    if (db.ticket && typeof db.ticket.groupBy === 'function') {
      try {
        const res = await db.ticket.groupBy({
          by: ['event_id', 'entry_status'],
          _count: true,
        });
        ticketGroups = res as unknown as TicketGroupEntry[];
      } catch {
        ticketGroups = [];
      }
    }

    const ticketUsageMap = new Map<string, { used: number; valid: number }>();
    for (const tg of ticketGroups) {
      const count = typeof tg._count === 'number' ? tg._count : (tg._count?._all ?? tg._count?.id ?? 1);
      const entry = ticketUsageMap.get(tg.event_id) ?? { used: 0, valid: 0 };
      if (tg.entry_status) {
        entry.used += count;
      } else {
        entry.valid += count;
      }
      ticketUsageMap.set(tg.event_id, entry);
    }

    interface EventWithRelations {
      id: string;
      slug: string;
      name: string;
      status: string;
      createdAt: Date;
      config?: {
        ticket_price_cents?: number;
        referral_commission_cents?: number;
        currency?: string;
        pay_alias?: string | null;
        contact_email?: string | null;
        max_tickets?: number | null;
        logo_url?: string | null;
      } | null;
      owner?: {
        id: string;
        email: string;
        invite_token: string | null;
      } | null;
    }

    return NextResponse.json({
      events: events.map((event: EventWithRelations) => {
        const sales = perEvent.get(event.id) ?? {
          approvedTickets: 0,
          pendingTickets: 0,
          approvedPurchases: 0,
          pendingPurchases: 0,
        };
        const usage = ticketUsageMap.get(event.id) ?? { used: 0, valid: 0 };
        const priceCents = event.config?.ticket_price_cents ?? 500000;
        const maxTickets = event.config?.max_tickets ?? null;
        const revenueCents = sales.approvedTickets * priceCents;
        const capacityOccupiedPercent = maxTickets && maxTickets > 0
          ? Math.round((sales.approvedTickets / maxTickets) * 100)
          : null;

        return {
          id: event.id,
          slug: event.slug,
          name: event.name,
          status: event.status,
          createdAt: event.createdAt,
          config: event.config ?? null,
          owner: event.owner ?? null,
          approvedTickets: sales.approvedTickets,
          pendingTickets: sales.pendingTickets,
          approvedPurchases: sales.approvedPurchases,
          pendingPurchases: sales.pendingPurchases,
          revenueCents,
          usedTickets: usage.used,
          validTickets: usage.valid,
          maxTickets,
          capacityOccupiedPercent,
        };
      }),
    });
  } catch (error: unknown) {
    console.error('Platform stats error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
