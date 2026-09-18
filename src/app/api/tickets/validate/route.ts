import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { ticketId, eventId } = await req.json();

    if (!ticketId) {
      return NextResponse.json({ error: 'El ID de la entrada es requerido.' }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido.' }, { status: 400 });
    }

    // Atomic conditional update scoped to the event: a ticket from another
    // event must answer TICKET NOT FOUND, never burn, to prevent race conditions (double check-in)
    const updateResult = await db.ticket.updateMany({
      where: {
        id: ticketId,
        event_id: eventId,
        entry_status: false,
      },
      data: {
        entry_status: true,
        entry_date: new Date(),
      },
    });

    // If no row was updated, the ticket was either already checked in or doesn't exist (or belongs to another event)
    if (updateResult.count === 0) {
      const ticket = await db.ticket.findFirst({
        where: { id: ticketId, event_id: eventId },
      });

      if (!ticket) {
        return NextResponse.json({ error: 'TICKET NOT FOUND' }, { status: 404 });
      }

      // Hide PII (holderName, buyerEmail) to prevent enumeration attacks
      return NextResponse.json(
        {
          error: 'TICKET ALREADY USED',
          entryDate: ticket.entry_date,
        },
        { status: 400 }
      );
    }

    // Load ticket details to display on successful check-in
    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, event_id: eventId },
      include: {
        purchase: {
          select: {
            buyer_email: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'TICKET NOT FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      buyerEmail: ticket.purchase.buyer_email,
      holderName: ticket.holder_name,
      ticketId: ticket.id,
      entryDate: ticket.entry_date,
    });
  } catch (error: any) {
    console.error('Ticket validation error:', error);
    return NextResponse.json({ error: 'Ocurrió un error en el servidor al validar la entrada.' }, { status: 500 });
  }
}
