import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json({ error: 'El ID de la entrada es requerido.' }, { status: 400 });
    }

    // Atomic conditional update to prevent race conditions (double check-in)
    const updateResult = await db.ticket.updateMany({
      where: {
        id: ticketId,
        entry_status: false,
      },
      data: {
        entry_status: true,
        entry_date: new Date(),
      },
    });

    // If no row was updated, the ticket was either already checked in or doesn't exist
    if (updateResult.count === 0) {
      const ticket = await db.ticket.findUnique({
        where: { id: ticketId },
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
    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
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
