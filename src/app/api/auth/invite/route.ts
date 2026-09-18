import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyInviteToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token de invitación requerido.' },
        { status: 400 }
      );
    }

    // Cryptographic and expiration verification (24h)
    const payload = await verifyInviteToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'El token de invitación es inválido o ha expirado (validez 24 horas).' },
        { status: 400 }
      );
    }

    // Database lookup: must match token and remain active (single-use)
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

    // Enforce tenant scoping: owner must belong to the event in the token
    if (owner.event_id !== payload.eventId) {
      return NextResponse.json(
        { error: 'La invitación no corresponde al evento solicitado.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: owner.email,
      eventName: owner.event.name,
      eventSlug: owner.event.slug,
    });
  } catch (error: unknown) {
    console.error('Error verifying invite token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
