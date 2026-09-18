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
  } catch (error: unknown) {
    console.error('Fetch referidos error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function normalizeCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!code || !/^[A-Z0-9_-]{2,32}$/.test(code)) return null;
  return code;
}

export async function POST(req: Request) {
  try {
    const { eventId, name, referralCode } = await req.json();

    if (!eventId) {
      return NextResponse.json({ error: 'eventId requerido' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const cleanName = String(name ?? '').trim();
    const code = normalizeCode(referralCode);
    if (!cleanName || !code) {
      return NextResponse.json({ error: 'Nombre y código válidos requeridos (2-32 caracteres A-Z 0-9 _ -).' }, { status: 400 });
    }

    const existing = await db.promoter.findFirst({
      where: { event_id: eventId, referral_code: code },
    });
    if (existing) {
      return NextResponse.json({ error: 'Ese código ya existe en este evento.' }, { status: 409 });
    }

    const created = await db.promoter.create({
      data: { event_id: eventId, name: cleanName, referral_code: code },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    console.error('Create promoter error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { eventId, promoterId, name, referralCode } = await req.json();

    if (!eventId || !promoterId) {
      return NextResponse.json({ error: 'eventId y promoterId requeridos' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const data: { name?: string; referral_code?: string } = {};
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return NextResponse.json({ error: 'Nombre inválido.' }, { status: 400 });
      }
      data.name = cleanName;
    }
    if (referralCode !== undefined) {
      const code = normalizeCode(referralCode);
      if (!code) {
        return NextResponse.json({ error: 'Código inválido (2-32 caracteres A-Z 0-9 _ -).' }, { status: 400 });
      }
      const clash = await db.promoter.findFirst({
        where: { event_id: eventId, referral_code: code, id: { not: promoterId } },
      });
      if (clash) {
        return NextResponse.json({ error: 'Ese código ya existe en este evento.' }, { status: 409 });
      }
      data.referral_code = code;
    }

    const updated = await db.promoter.updateMany({
      where: { id: promoterId, event_id: eventId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Promoter no encontrado en este evento.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Update promoter error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { eventId, promoterId } = await req.json();

    if (!eventId || !promoterId) {
      return NextResponse.json({ error: 'eventId y promoterId requeridos' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const deleted = await db.promoter.deleteMany({
      where: { id: promoterId, event_id: eventId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Promoter no encontrado en este evento.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Delete promoter error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
