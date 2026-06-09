import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '@/lib/constants';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = formData.get('email') as string;
    const quantityStr = formData.get('quantity') as string;
    const referralCode = formData.get('referralCode') as string | null;
    const receiptFile = formData.get('receipt') as File | null;
    const attendeeNamesStr = formData.get('attendeeNames') as string; // JSON array of names
    const dietaryPreferences = formData.get('dietaryPreferences') as string | null;

    if (!email || !quantityStr || !receiptFile || !attendeeNamesStr) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 });
    }

    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida.' }, { status: 400 });
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

    // Dynamic promoter creation or association
    let promoterId: string | null = null;
    if (referralCode && referralCode.trim() !== '') {
      const code = referralCode.trim().toUpperCase();
      let promoter = await db.promoter.findUnique({
        where: { referral_code: code },
      });

      // If promoter does not exist, create dynamically on the fly
      if (!promoter) {
        promoter = await db.promoter.create({
          data: {
            name: code, // Set name equal to code for dynamic identification
            referral_code: code,
          },
        });
      }
      promoterId = promoter.id;
    }

    // Convert receipt to base64 data URL (Vercel serverless has read-only filesystem)
    const bytes = await receiptFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = receiptFile.type || 'application/octet-stream';
    const receiptUrl = `data:${mimeType};base64,${base64}`;

    // Create Purchase
    const purchase = await db.purchase.create({
      data: {
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
