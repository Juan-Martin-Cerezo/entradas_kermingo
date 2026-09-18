import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import {
  hashPassword,
  signInviteToken,
  signSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/mailer';
import { RESERVED_SLUGS } from '@/lib/constants';
import { checkSignupRateLimit } from '@/lib/rate-limit';

export function isSelfSignupOpen(): boolean {
  return process.env.ALLOW_SELF_SIGNUP === '1';
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function siteOrigin(req: Request): string {
  return (
    req.headers.get('origin') ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  );
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

export async function GET() {
  return NextResponse.json({ open: isSelfSignupOpen() });
}

export async function POST(req: Request) {
  try {
    if (!isSelfSignupOpen()) {
      return NextResponse.json(
        { error: 'El registro público está cerrado en esta instancia.' },
        { status: 403 }
      );
    }

    if (checkSignupRateLimit(clientIp(req))) {
      return NextResponse.json(
        { error: 'Demasiados registros desde esta red en la última hora. Intentá de nuevo más tarde.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'El email no tiene un formato válido.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres.' },
        { status: 400 }
      );
    }

    const existingOwner = await db.eventOwner.findUnique({
      where: { email: cleanEmail },
    });
    if (existingOwner) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta registrada con ese email.' },
        { status: 409 }
      );
    }

    const baseSlug = slugify(`mi-evento-${crypto.randomBytes(3).toString('hex')}`);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 3; attempt++) {
      const collision = await db.event.findUnique({ where: { slug } });
      const reserved = RESERVED_SLUGS.has(slug);
      if (!collision && !reserved) break;
      slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const name = 'Mi primer evento';

    const event = await db.event.create({
      data: { slug, name, status: 'DRAFT' },
    });

    let owner;
    try {
      const verifyToken = await signInviteToken({
        email: cleanEmail,
        eventId: event.id,
        eventSlug: event.slug,
      });

      owner = await db.eventOwner.create({
        data: {
          event_id: event.id,
          email: cleanEmail,
          password_hash: await hashPassword(password),
          invite_token: verifyToken,
        },
      });

      const verifyUrl = `${siteOrigin(req)}/verificar?token=${encodeURIComponent(verifyToken)}`;
      try {
        await sendVerificationEmail(cleanEmail, name, verifyUrl);
      } catch (mailError) {
        console.error('Error enviando email de verificación:', mailError);
      }
    } catch (ownerError) {
      await db.event.delete({ where: { id: event.id } }).catch(() => undefined);
      throw ownerError;
    }

    const sessionToken = await signSession({
      role: 'owner',
      eventId: event.id,
      eventSlug: event.slug,
      email: owner.email,
    });

    const response = NextResponse.json(
      {
        success: true,
        role: 'owner',
        eventId: event.id,
        eventSlug: event.slug,
        event: { id: event.id, slug: event.slug, name: event.name, status: event.status },
        needsEventSetup: true,
      },
      { status: 201 }
    );
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookie());

    return response;
  } catch (error: unknown) {
    console.error('Error en registro self-service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
