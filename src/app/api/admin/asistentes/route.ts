import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tickets = await db.ticket.findMany({
      where: {
        purchase: {
          payment_status: 'APPROVED',
        },
      },
      include: {
        purchase: {
          include: {
            promoter: true,
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
    const { ticketId, action, password } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ticketId || !['CHECKIN', 'RESET'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const updated = await db.ticket.update({
      where: { id: ticketId },
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
