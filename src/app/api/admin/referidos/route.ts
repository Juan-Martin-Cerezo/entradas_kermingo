import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { getEventPricing } from '@/lib/pricing';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pricing = await getEventPricing(eventId);

    const promoters = await db.promoter.findMany({
      where: { event_id: eventId },
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
      const commissionCents = totalTickets * pricing.referralCommissionCents;
      return {
        id: p.id,
        name: p.name,
        referralCode: p.referral_code,
        totalTickets,
        commissionCents,
      };
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Fetch referidos error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
