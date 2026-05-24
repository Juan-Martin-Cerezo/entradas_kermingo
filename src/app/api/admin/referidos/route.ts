import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const promoters = await db.promoter.findMany({
      include: {
        purchases: {
          where: { payment_status: 'APPROVED' },
        },
      },
    });

    const report = promoters.map((p) => {
      const totalTickets = p.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
      const commission = totalTickets * 1000;
      return {
        id: p.id,
        name: p.name,
        referralCode: p.referral_code,
        totalTickets,
        commission,
      };
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Fetch referidos error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
