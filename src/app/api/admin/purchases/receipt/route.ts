import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { getReceiptUrl } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const eventId = searchParams.get('eventId');

    if (!id) {
      return NextResponse.json({ error: 'Missing purchase ID' }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchase = await db.purchase.findFirst({
      where: { id, event_id: eventId },
      select: {
        receipt_url: true,
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    if (!purchase.receipt_url) {
      return NextResponse.json({ error: 'El comprobante no está disponible o fue eliminado.' }, { status: 404 });
    }

    const viewableUrl = await getReceiptUrl(purchase.receipt_url);
    return NextResponse.json({ receipt_url: viewableUrl });
  } catch (error: any) {
    console.error('Fetch receipt error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
