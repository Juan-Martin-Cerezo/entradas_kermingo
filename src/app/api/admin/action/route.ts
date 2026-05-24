import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { sendTicketsEmail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const { purchaseId, action, password } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!purchaseId || !['APPROVE', 'REJECT', 'DELETE'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // Handle DELETE action (cascades automatically to Tickets in DB schema)
    if (action === 'DELETE') {
      await db.purchase.delete({
        where: { id: purchaseId },
      });
      return NextResponse.json({ success: true });
    }

    if (purchase.payment_status !== 'PENDING') {
      return NextResponse.json({ error: 'Purchase already processed' }, { status: 400 });
    }

    if (action === 'REJECT') {
      await db.purchase.update({
        where: { id: purchaseId },
        data: { payment_status: 'REJECTED' },
      });
      return NextResponse.json({ success: true });
    }

    // action === 'APPROVE'
    // Create tickets and update purchase status in a transaction
    const tickets = await db.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchaseId },
        data: { payment_status: 'APPROVED' },
      });

      let names: string[] = [];
      try {
        names = JSON.parse(purchase.attendee_names);
      } catch {
        names = [];
      }

      const ticketCreations = Array.from({ length: purchase.quantity }).map((_, index) => {
        const holderName = names[index] || `Invitado ${index + 1}`;
        return tx.ticket.create({
          data: {
            purchase_id: purchaseId,
            holder_name: holderName,
          },
        });
      });

      return Promise.all(ticketCreations);
    });

    // Generate QR codes
    const ticketsWithQr = await Promise.all(
      tickets.map(async (t) => {
        const qrDataUrl = await QRCode.toDataURL(t.id);
        return {
          id: t.id,
          qrDataUrl,
          holderName: t.holder_name,
        };
      })
    );

    // Send email
    try {
      if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('placeholder')) {
        throw new Error('Las credenciales SMTP (correo) siguen en valores de marcador de posición (placeholder) en tu archivo .env.');
      }
      await sendTicketsEmail(purchase.buyer_email, ticketsWithQr);
    } catch (mailError: any) {
      console.error('Mailer execution warning:', mailError);
      return NextResponse.json({
        success: true,
        warning: `¡Entradas generadas con éxito! Sin embargo, el email no pudo ser enviado: ${mailError.message || mailError}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin Action API error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
