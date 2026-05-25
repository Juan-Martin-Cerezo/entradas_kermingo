import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const isAuthorized = await checkAuth();
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing purchase ID' }, { status: 400 });
    }

    const purchase = await db.purchase.findUnique({
      where: { id },
      select: {
        receipt_url: true,
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    return NextResponse.json({ receipt_url: purchase.receipt_url });
  } catch (error: any) {
    console.error('Fetch receipt error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
