import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyInviteToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token de verificación requerido.' },
        { status: 400 }
      );
    }

    const payload = await verifyInviteToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'El token de verificación es inválido o ha expirado (validez 24 horas).' },
        { status: 400 }
      );
    }

    const owner = await db.eventOwner.findUnique({
      where: { invite_token: token },
      include: { event: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Verificación no encontrada o ya utilizada.' },
        { status: 400 }
      );
    }

    if (
      owner.event_id !== payload.eventId ||
      owner.email.toLowerCase() !== payload.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'No tienes autorización para verificar esta cuenta.' },
        { status: 403 }
      );
    }

    await db.eventOwner.update({
      where: { id: owner.id },
      data: { invite_token: null },
    });

    return NextResponse.json({
      verified: true,
      email: owner.email,
      eventName: owner.event.name,
      eventSlug: owner.event.slug,
    });
  } catch (error: unknown) {
    console.error('Error verificando email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
