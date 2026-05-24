import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pendingPurchases = await db.purchase.findMany({
      where: { payment_status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        promoter: true,
      },
    });

    return NextResponse.json(pendingPurchases);
  } catch (error: any) {
    console.error('Fetch pending purchases error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
