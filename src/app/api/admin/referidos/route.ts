import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { REFERRAL_COMMISSION } from '@/lib/constants';

export async function GET(req: Request) {
  try {
    const isAuthorized = await checkAuth();
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const promoters = await db.promoter.findMany({
      include: {
        purchases: {
          where: { payment_status: 'APPROVED' },
          select: {
            quantity: true,
          },
        },
      },
    });

    const report = promoters.map((p) => {
      const totalTickets = p.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
      const commission = totalTickets * REFERRAL_COMMISSION;
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
