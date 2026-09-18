import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const events = await db.event.findMany({
      where: { status: 'ON_SALE' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(events);
  } catch (error: unknown) {
    console.error('Events list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
