import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { sendTicketsEmail, sendRejectionEmail } from '@/lib/mailer';
import { checkAuth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const isAuthorized = await checkAuth();
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { purchaseId, action } = await req.json();

    if (!purchaseId || !['APPROVE', 'REJECT', 'DELETE', 'RESEND_EMAIL'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Handle RESEND_EMAIL action
    if (action === 'RESEND_EMAIL') {
      const purchase = await db.purchase.findUnique({
        where: { id: purchaseId },
        include: {
          tickets: true,
        },
      });

      if (!purchase) {
        return NextResponse.json({ error: 'Compra no encontrada.' }, { status: 404 });
      }

      if (purchase.payment_status !== 'APPROVED') {
        return NextResponse.json({ error: 'La compra no está aprobada.' }, { status: 400 });
      }

      // Generate QR codes
      const ticketsWithQr = await Promise.all(
        purchase.tickets.map(async (t) => {
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
        
        await db.purchase.update({
          where: { id: purchaseId },
          data: { email_sent: true },
        });

        return NextResponse.json({ success: true });
      } catch (mailError: any) {
        console.error('Resend Mailer execution error:', mailError);
        await db.purchase.update({
          where: { id: purchaseId },
          data: { email_sent: false },
        });
        return NextResponse.json(
          { error: `No se pudo enviar el correo: ${mailError.message || mailError}` },
          { status: 500 }
        );
      }
    }

    // Handle DELETE action (cascades automatically to Tickets in DB schema)
    if (action === 'DELETE') {
      await db.purchase.delete({
        where: { id: purchaseId },
      });
      return NextResponse.json({ success: true });
    }

    // Execute APPROVE or REJECT inside an atomic transaction with row locking
    const transactionResult = await db.$transaction(async (tx) => {
      // Lock the row to prevent concurrent modifications
      const [purchase] = await tx.$queryRaw<any[]>`
        SELECT id, payment_status, buyer_email, quantity, attendee_names 
        FROM "Purchase" 
        WHERE id = ${purchaseId}::uuid 
        FOR UPDATE
      `;

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (purchase.payment_status !== 'PENDING') {
        throw new Error('Purchase already processed');
      }

      if (action === 'REJECT') {
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { payment_status: 'REJECTED' },
        });
        return { action, buyerEmail: purchase.buyer_email, quantity: purchase.quantity };
      }

      // action === 'APPROVE'
      // Create tickets and update purchase status
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

      const createdTickets = await Promise.all(ticketCreations);

      return { action, buyerEmail: purchase.buyer_email, tickets: createdTickets };
    });

    // Handle post-transaction side effects (Emails)
    if (transactionResult.action === 'REJECT') {
      const requestUrl = new URL(req.url);
      const siteUrl = `${requestUrl.protocol}//${requestUrl.host}`;

      try {
        if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('placeholder')) {
          throw new Error('Las credenciales SMTP (correo) siguen en valores de marcador de posición (placeholder) en tu archivo .env.');
        }
        await sendRejectionEmail(transactionResult.buyerEmail, transactionResult.quantity, siteUrl);
      } catch (mailError: any) {
        console.error('Rejection Mailer execution error:', mailError);
        // Purchase status is updated, but notify admin that mail failed
        return NextResponse.json({
          success: true,
          warning: `¡Compra rechazada con éxito! Sin embargo, el email de rechazo no pudo ser enviado: ${mailError.message || mailError}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (transactionResult.action === 'APPROVE' && transactionResult.tickets) {
      // Generate QR codes
      const ticketsWithQr = await Promise.all(
        transactionResult.tickets.map(async (t) => {
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
        await sendTicketsEmail(transactionResult.buyerEmail, ticketsWithQr);
        
        // Update email_sent status in DB
        await db.purchase.update({
          where: { id: purchaseId },
          data: { email_sent: true },
        });
      } catch (mailError: any) {
        console.error('Mailer execution error:', mailError);
        
        await db.purchase.update({
          where: { id: purchaseId },
          data: { email_sent: false },
        });

        // Return error status so the admin knows the email delivery failed
        return NextResponse.json(
          { 
            error: `¡Tickets creados, pero falló el envío por correo! Por favor usá el botón "Reenviar" más tarde. Detalle: ${mailError.message || mailError}` 
          }, 
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin Action API error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
