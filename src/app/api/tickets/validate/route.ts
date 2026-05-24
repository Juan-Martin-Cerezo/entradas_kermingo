import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        purchase: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'TICKET NOT FOUND' }, { status: 404 });
    }

    if (ticket.entry_status) {
      return NextResponse.json(
        {
          error: 'TICKET ALREADY USED',
          entryDate: ticket.entry_date,
          buyerEmail: ticket.purchase.buyer_email,
        },
        { status: 400 }
      );
    }

    // Mark ticket as scanned/validated
    const updatedTicket = await db.ticket.update({
      where: { id: ticketId },
      data: {
        entry_status: true,
        entry_date: new Date(),
      },
      include: {
        purchase: true,
      },
    });

    return NextResponse.json({
      success: true,
      buyerEmail: updatedTicket.purchase.buyer_email,
      ticketId: updatedTicket.id,
      entryDate: updatedTicket.entry_date,
    });
  } catch (error: any) {
    console.error('Ticket validation error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
