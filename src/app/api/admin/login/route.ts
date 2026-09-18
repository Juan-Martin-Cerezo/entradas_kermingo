import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  signSession,
  verifySuperadminCredentials,
  verifyPassword,
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
} from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, slug } = body;

    if (!password) {
      return NextResponse.json({ error: 'Contraseña requerida.' }, { status: 400 });
    }

    // 1. Check superadmin credentials
    if (verifySuperadminCredentials(email, password)) {
      const sessionToken = await signSession({
        role: 'superadmin',
        email: email || process.env.SUPERADMIN_EMAIL || 'superadmin@eventhub.app',
      });

      const response = NextResponse.json({ success: true, role: 'superadmin' });

      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      // Maintain legacy admin_session cookie
      const legacyToken = crypto
        .createHash('sha256')
        .update(process.env.ADMIN_PASSWORD || password)
        .digest('hex');

      response.cookies.set(LEGACY_COOKIE_NAME, legacyToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    // 2. Check EventOwner credentials if email is provided
    if (email) {
      const owner = await db.eventOwner.findUnique({
        where: { email: String(email).toLowerCase() },
        include: { event: true },
      });

      if (owner && (await verifyPassword(owner.password_hash, password))) {
        if (slug && owner.event.slug !== slug) {
          return NextResponse.json({ error: 'Credenciales inválidas para este evento.' }, { status: 403 });
        }

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
          maxAge: 60 * 60 * 24 * 7,
        });

        return response;
      }
    }

    return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
  } catch (error: unknown) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
