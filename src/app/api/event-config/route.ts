import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: 'slug requerido.' }, { status: 400 });
    }

    const event = await db.event.findUnique({
      where: { slug },
      select: {
        name: true,
        status: true,
        config: {
          select: {
            pay_alias: true,
            contact_email: true,
            logo_url: true,
            currency: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      name: event.name,
      status: event.status,
      payAlias: event.config?.pay_alias ?? null,
      contactEmail: event.config?.contact_email ?? null,
      logoUrl: event.config?.logo_url ?? null,
      currency: event.config?.currency ?? 'ARS',
    });
  } catch (error: unknown) {
    console.error('Event config lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
