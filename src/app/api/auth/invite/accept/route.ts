import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  hashPassword,
  verifyInviteToken,
  signSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token y contraseña son requeridos.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres.' },
        { status: 400 }
      );
    }

    // 1. Verify token signature and 24-hour expiration
    const payload = await verifyInviteToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'El token de invitación es inválido o ha expirado (validez 24 horas).' },
        { status: 400 }
      );
    }

    // 2. Lookup owner by invite_token (enforces single-use)
    const owner = await db.eventOwner.findUnique({
      where: { invite_token: token },
      include: { event: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Invitación no encontrada o ya utilizada.' },
        { status: 400 }
      );
    }

    // 3. Enforce tenant isolation and claim integrity
    if (
      owner.event_id !== payload.eventId ||
      owner.email.toLowerCase() !== payload.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'No tienes autorización para reclamar este evento.' },
        { status: 403 }
      );
    }

    // 4. Hash password with argon2id
    const passwordHash = await hashPassword(password);

    // 5. Update owner: set password_hash and clear invite_token to null
    await db.eventOwner.update({
      where: { id: owner.id },
      data: {
        password_hash: passwordHash,
        invite_token: null, // Token is consumed; cannot be used a second time
      },
    });

    // 6. Sign session for the new owner and log in immediately
    const sessionToken = await signSession({
      role: 'owner',
      eventId: owner.event_id,
      eventSlug: owner.event.slug,
      email: owner.email,
    });

    const response = NextResponse.json({
      success: true,
      role: 'owner',
      eventId: owner.event_id,
      eventSlug: owner.event.slug,
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: unknown) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
