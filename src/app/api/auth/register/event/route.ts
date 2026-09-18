import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getSessionFromCookies,
  signSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { RESERVED_SLUGS } from '@/lib/constants';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function sessionCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function PATCH(req: Request) {
  try {
    const session = await getSessionFromCookies();

    if (!session || session.role !== 'owner' || !session.eventId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      slug,
      fecha,
      ticketPriceCents,
      referralCommissionCents,
      currency,
      payAlias,
      contactEmail,
      maxTickets,
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'name y slug son campos obligatorios.' },
        { status: 400 }
      );
    }

    const cleanName = String(name).trim();
    const cleanSlug = slugify(String(slug).trim());

    if (!cleanName) {
      return NextResponse.json(
        { error: 'El nombre del evento no puede estar vacío.' },
        { status: 400 }
      );
    }

    if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
      return NextResponse.json(
        { error: 'El slug solo puede contener letras minúsculas, números y guiones.' },
        { status: 400 }
      );
    }

    if (RESERVED_SLUGS.has(cleanSlug)) {
      return NextResponse.json(
        { error: 'El slug seleccionado está reservado para el sistema.' },
        { status: 400 }
      );
    }

    let startsAt: Date | null = null;
    if (fecha !== undefined && fecha !== null && String(fecha).trim() !== '') {
      const parsed = new Date(`${String(fecha).trim()}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'La fecha del evento no es válida (usá YYYY-MM-DD).' },
          { status: 400 }
        );
      }
      startsAt = parsed;
    }

    const existing = await db.event.findUnique({ where: { slug: cleanSlug } });
    if (existing && existing.id !== session.eventId) {
      return NextResponse.json(
        { error: 'Ya existe otro evento con ese slug.' },
        { status: 409 }
      );
    }

    const updated = await db.event.update({
      where: { id: session.eventId },
      data: { name: cleanName, slug: cleanSlug },
    });

    const configUpdate: Record<string, number | string | null> = {};
    const configCreate: {
      ticket_price_cents?: number;
      referral_commission_cents?: number;
      currency?: string;
      pay_alias?: string | null;
      contact_email?: string | null;
      max_tickets?: number | null;
    } = {};
    if (ticketPriceCents !== undefined) {
      const v = Number(ticketPriceCents);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json(
          { error: 'El precio debe ser un entero positivo en centavos.' },
          { status: 400 }
        );
      }
      configUpdate.ticket_price_cents = v;
      configCreate.ticket_price_cents = v;
    }
    if (referralCommissionCents !== undefined) {
      const v = Number(referralCommissionCents);
      if (!Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { error: 'La comisión debe ser un entero no negativo en centavos.' },
          { status: 400 }
        );
      }
      configUpdate.referral_commission_cents = v;
      configCreate.referral_commission_cents = v;
    }
    if (currency !== undefined) {
      configUpdate.currency = String(currency).trim().toUpperCase();
      configCreate.currency = String(currency).trim().toUpperCase();
    }
    if (payAlias !== undefined) {
      configUpdate.pay_alias = payAlias ? String(payAlias).trim() : null;
      configCreate.pay_alias = payAlias ? String(payAlias).trim() : null;
    }
    if (contactEmail !== undefined) {
      configUpdate.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
      configCreate.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
    }
    if (maxTickets !== undefined) {
      const v = maxTickets === null || maxTickets === '' ? null : Number(maxTickets);
      if (v !== null && (!Number.isInteger(v) || v <= 0)) {
        return NextResponse.json(
          { error: 'El cupo máximo debe ser un entero positivo.' },
          { status: 400 }
        );
      }
      configUpdate.max_tickets = v;
      configCreate.max_tickets = v;
    }

    if (Object.keys(configUpdate).length > 0) {
      await db.eventConfig.upsert({
        where: { event_id: session.eventId },
        update: configUpdate,
        create: {
          event: { connect: { id: session.eventId } },
          ...configCreate,
        },
      });
    }

    const warnings: string[] = [];
    if (startsAt) {
      warnings.push(
        'Fecha aceptada, pero el schema actual no tiene campo starts_at: pedí al PM agregar Event.starts_at para persistirla.'
      );
    }

    const refreshed = await signSession({
      role: 'owner',
      eventId: session.eventId,
      eventSlug: updated.slug,
      email: session.email,
    });

    const response = NextResponse.json({
      success: true,
      event: { id: updated.id, slug: updated.slug, name: updated.name },
      fecha: startsAt ? startsAt.toISOString().slice(0, 10) : null,
      warnings,
    });
    response.cookies.set(SESSION_COOKIE_NAME, refreshed, sessionCookie());

    return response;
  } catch (error: unknown) {
    console.error('Error en wizard del primer evento:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
