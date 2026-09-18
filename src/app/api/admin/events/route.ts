import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth, signInviteToken } from '@/lib/auth';
import { RESERVED_SLUGS } from '@/lib/constants';
import { sendInviteEmail } from '@/lib/mailer';

export async function GET() {
  try {
    const isAuthorized = await checkAuth(undefined, ['superadmin']);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const events = await db.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        config: true,
        owner: {
          select: {
            id: true,
            email: true,
            invite_token: true,
          },
        },
      },
    });

    return NextResponse.json(events);
  } catch (error: unknown) {
    console.error('Error fetching admin events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const isAuthorized = await checkAuth(undefined, ['superadmin']);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      slug,
      name,
      ownerEmail,
      ticketPriceCents = 500000,
      referralCommissionCents = 100000,
      currency = 'ARS',
      payAlias,
      contactEmail,
      maxTickets,
      logoUrl,
    } = body;

    // Required fields
    if (!slug || !name || !ownerEmail) {
      return NextResponse.json(
        { error: 'slug, name y ownerEmail son campos obligatorios.' },
        { status: 400 }
      );
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanEmail = String(ownerEmail).trim().toLowerCase();

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'El email del organizador no tiene un formato válido.' },
        { status: 400 }
      );
    }

    // Check uniqueness
    const existingEvent = await db.event.findUnique({
      where: { slug: cleanSlug },
    });
    if (existingEvent) {
      return NextResponse.json(
        { error: 'Ya existe un evento con ese slug.' },
        { status: 409 }
      );
    }

    const existingOwner = await db.eventOwner.findUnique({
      where: { email: cleanEmail },
    });
    if (existingOwner) {
      return NextResponse.json(
        { error: 'Ya existe un organizador registrado con ese email.' },
        { status: 409 }
      );
    }

    // Create Event and Config
    const event = await db.event.create({
      data: {
        slug: cleanSlug,
        name: cleanName,
        status: 'DRAFT',
        config: {
          create: {
            ticket_price_cents: Number(ticketPriceCents) || 500000,
            referral_commission_cents: Number(referralCommissionCents) || 100000,
            currency: String(currency || 'ARS'),
            pay_alias: payAlias ? String(payAlias).trim() : null,
            contact_email: contactEmail ? String(contactEmail).trim() : cleanEmail,
            max_tickets: maxTickets ? Number(maxTickets) : null,
            logo_url: logoUrl ? String(logoUrl).trim() : null,
          },
        },
      },
    });

    // Generate 24h single-use invite token
    const inviteToken = await signInviteToken({
      email: cleanEmail,
      eventId: event.id,
      eventSlug: event.slug,
    });

    // Create EventOwner with pending password and invite token
    const owner = await db.eventOwner.create({
      data: {
        event_id: event.id,
        email: cleanEmail,
        password_hash: '',
        invite_token: inviteToken,
      },
    });

    // Determine site URL for invite link
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';
    const inviteUrl = `${origin}/invitacion?token=${encodeURIComponent(inviteToken)}`;

    // Send invitation email
    try {
      await sendInviteEmail(cleanEmail, cleanName, inviteUrl);
    } catch (mailError) {
      console.error('Error enviando email de invitación:', mailError);
    }

    return NextResponse.json(
      {
        success: true,
        event: {
          id: event.id,
          slug: event.slug,
          name: event.name,
          status: event.status,
        },
        owner: {
          id: owner.id,
          email: owner.email,
        },
        inviteToken,
        inviteUrl,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating event and invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const isAuthorized = await checkAuth(undefined, ['superadmin']);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      name,
      slug,
      status,
      ticketPriceCents,
      referralCommissionCents,
      currency,
      payAlias,
      contactEmail,
      maxTickets,
      logoUrl,
      reinvite,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de evento requerido.' }, { status: 400 });
    }

    const existing = await db.event.findUnique({
      where: { id },
      include: { config: true, owner: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 });
    }

    const eventUpdateData: Record<string, unknown> = {};

    if (name !== undefined) {
      eventUpdateData.name = String(name).trim();
    }

    if (status !== undefined) {
      if (!['DRAFT', 'ON_SALE', 'CLOSED'].includes(status)) {
        return NextResponse.json(
          { error: 'Estado inválido. Debe ser DRAFT, ON_SALE o CLOSED.' },
          { status: 400 }
        );
      }
      eventUpdateData.status = status;
    }

    if (slug !== undefined) {
      const cleanSlug = String(slug).trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
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
      if (cleanSlug !== existing.slug) {
        const slugExists = await db.event.findUnique({ where: { slug: cleanSlug } });
        if (slugExists) {
          return NextResponse.json(
            { error: 'Ya existe otro evento con ese slug.' },
            { status: 409 }
          );
        }
        eventUpdateData.slug = cleanSlug;
      }
    }

    if (Object.keys(eventUpdateData).length > 0) {
      await db.event.update({
        where: { id },
        data: eventUpdateData,
      });
    }

    const configUpdateData: Record<string, unknown> = {};
    if (ticketPriceCents !== undefined) {
      configUpdateData.ticket_price_cents = Number(ticketPriceCents);
    }
    if (referralCommissionCents !== undefined) {
      configUpdateData.referral_commission_cents = Number(referralCommissionCents);
    }
    if (currency !== undefined) {
      configUpdateData.currency = String(currency).trim().toUpperCase();
    }
    if (payAlias !== undefined) {
      configUpdateData.pay_alias = payAlias ? String(payAlias).trim() : null;
    }
    if (contactEmail !== undefined) {
      configUpdateData.contact_email = contactEmail ? String(contactEmail).trim() : null;
    }
    if (maxTickets !== undefined) {
      configUpdateData.max_tickets = maxTickets !== null && maxTickets !== '' ? Number(maxTickets) : null;
    }
    if (logoUrl !== undefined) {
      configUpdateData.logo_url = logoUrl ? String(logoUrl).trim() : null;
    }

    if (Object.keys(configUpdateData).length > 0) {
      await db.eventConfig.upsert({
        where: { event_id: id },
        update: configUpdateData,
        create: {
          event_id: id,
          ticket_price_cents: Number(ticketPriceCents) || 500000,
          referral_commission_cents: Number(referralCommissionCents) || 100000,
          currency: String(currency || 'ARS').trim().toUpperCase(),
          pay_alias: payAlias ? String(payAlias).trim() : null,
          contact_email: contactEmail ? String(contactEmail).trim() : null,
          max_tickets: maxTickets !== null && maxTickets !== '' ? Number(maxTickets) : null,
          logo_url: logoUrl ? String(logoUrl).trim() : null,
        },
      });
    }

    let inviteToken: string | undefined;
    let inviteUrl: string | undefined;

    if (reinvite && existing.owner?.email) {
      const activeSlug = (eventUpdateData.slug as string) || existing.slug;
      inviteToken = await signInviteToken({
        email: existing.owner.email,
        eventId: existing.id,
        eventSlug: activeSlug,
      });

      await db.eventOwner.update({
        where: { id: existing.owner.id },
        data: { invite_token: inviteToken },
      });

      const origin =
        req.headers.get('origin') ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'http://localhost:3000';
      inviteUrl = `${origin}/invitacion?token=${encodeURIComponent(inviteToken)}`;

      try {
        const activeName = (eventUpdateData.name as string) || existing.name;
        await sendInviteEmail(existing.owner.email, activeName, inviteUrl);
      } catch (mailError) {
        console.error('Error reenviando email de invitación:', mailError);
      }
    }

    const updated = await db.event.findUnique({
      where: { id },
      include: {
        config: true,
        owner: {
          select: {
            id: true,
            email: true,
            invite_token: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      event: updated,
      inviteToken,
      inviteUrl,
    });
  } catch (error: unknown) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
