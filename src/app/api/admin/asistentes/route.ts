import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

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

    const tickets = await db.ticket.findMany({
      where: {
        event_id: eventId,
        purchase: {
          payment_status: 'APPROVED',
        },
      },
      include: {
        purchase: {
          select: {
            buyer_email: true,
            promoter: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        holder_name: 'asc',
      },
    });

    const data = tickets.map((t) => ({
      id: t.id,
      holderName: t.holder_name,
      entryStatus: t.entry_status,
      entryDate: t.entry_date,
      buyerEmail: t.purchase.buyer_email,
      promoterName: t.purchase.promoter?.name || 'Ninguno',
    }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Fetch assistants error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { ticketId, action, eventId } = await req.json();

    if (!ticketId || !['CHECKIN', 'RESET'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, event_id: eventId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const updated = await db.ticket.update({
      where: { id: ticket.id },
      data: {
        entry_status: action === 'CHECKIN',
        entry_date: action === 'CHECKIN' ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, entryStatus: updated.entry_status });
  } catch (error: any) {
    console.error('Manual checkin error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
