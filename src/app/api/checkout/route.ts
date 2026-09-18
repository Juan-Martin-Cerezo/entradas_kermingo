import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '@/lib/constants';
import { uploadReceipt } from '@/lib/storage';
import { checkMemoryRateLimit } from '@/lib/rate-limit';

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = formData.get('email') as string;
    const quantityStr = formData.get('quantity') as string;
    const referralCode = formData.get('referralCode') as string | null;
    const receiptFile = formData.get('receipt') as File | null;
    const attendeeNamesStr = formData.get('attendeeNames') as string; // JSON array of names
    const dietaryPreferences = formData.get('dietaryPreferences') as string | null;
    const eventSlug = formData.get('eventSlug') as string | null;

    if (!email || !quantityStr || !receiptFile || !attendeeNamesStr) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 });
    }

    if (!eventSlug) {
      return NextResponse.json({ error: 'Evento requerido.' }, { status: 400 });
    }

    const event = await db.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, status: true, config: { select: { max_tickets: true } } },
    });

    if (!event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 });
    }

    if (event.status !== 'ON_SALE') {
      return NextResponse.json({ error: 'La venta para este evento no está abierta.' }, { status: 403 });
    }

    const eventId = event.id;

    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida.' }, { status: 400 });
    }

    if (checkMemoryRateLimit(eventId, clientIp(req))) {
      return NextResponse.json(
        { error: 'Demasiadas compras en la última hora. Intentá de nuevo más tarde.' },
        { status: 429 }
      );
    }

    const maxTickets = event.config?.max_tickets ?? null;
    if (maxTickets !== null) {
      const sold = await db.purchase.aggregate({
        where: { event_id: eventId, payment_status: { not: 'REJECTED' } },
        _sum: { quantity: true },
      });
      const soldQty = sold._sum.quantity ?? 0;
      if (soldQty + quantity > maxTickets) {
        return NextResponse.json(
          { error: 'El cupo del evento está completo. La venta pública está cerrada.' },
          { status: 403 }
        );
      }
    }

    let attendeeNames: string[] = [];
    try {
      attendeeNames = JSON.parse(attendeeNamesStr);
      if (!Array.isArray(attendeeNames) || attendeeNames.length !== quantity) {
        return NextResponse.json({ error: 'La cantidad de nombres debe coincidir con la cantidad de entradas.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Formato de nombres de asistentes inválido.' }, { status: 400 });
    }

    // Server-side validation of file size and MIME type to protect DB storage
    if (receiptFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El comprobante excede el tamaño máximo permitido de 2MB.' }, { status: 400 });
    }

    if (!ALLOWED_FILE_TYPES.includes(receiptFile.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP) o PDFs.' }, { status: 400 });
    }

    // Dynamic promoter creation or association (scoped per event:
    // same referral_code can exist in different events)
    let promoterId: string | null = null;
    if (referralCode && referralCode.trim() !== '') {
      const code = referralCode.trim().toUpperCase();
      let promoter = await db.promoter.findUnique({
        where: { event_id_referral_code: { event_id: eventId, referral_code: code } },
      });

      // If promoter does not exist, create dynamically on the fly
      if (!promoter) {
        promoter = await db.promoter.create({
          data: {
            event_id: eventId,
            name: code, // Set name equal to code for dynamic identification
            referral_code: code,
          },
        });
      }
      promoterId = promoter.id;
    }

    // Upload receipt via configured STORAGE_MODE (r2, blob, or db fallback)
    const bytes = await receiptFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = receiptFile.type || 'application/octet-stream';
    const { url: receiptUrl } = await uploadReceipt({
      eventId,
      fileBuffer: buffer,
      mimeType,
      filename: receiptFile.name,
    });

    // Create Purchase
    const purchase = await db.purchase.create({
      data: {
        event_id: eventId,
        buyer_email: email,
        quantity,
        receipt_url: receiptUrl,
        payment_status: 'PENDING',
        promoter_id: promoterId,
        attendee_names: JSON.stringify(attendeeNames),
        dietary_preferences: dietaryPreferences || '',
        email_sent: false,
      },
    });

    return NextResponse.json({ success: true, purchaseId: purchase.id });
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json({ error: 'Ocurrió un error en el servidor al procesar la compra.' }, { status: 500 });
  }
}
