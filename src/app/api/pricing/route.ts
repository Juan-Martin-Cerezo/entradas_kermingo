import { NextResponse } from 'next/server';
import { getEventPricingBySlug, FALLBACK_PRICING } from '@/lib/pricing';

// No hay evento por defecto: el precio siempre es de un evento concreto.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug requerido.' }, { status: 400 });
  }
  try {
    const pricing = await getEventPricingBySlug(slug);
    return NextResponse.json({
      slug,
      ticketPriceCents: pricing.ticketPriceCents,
      currency: pricing.currency,
      fallback: pricing === FALLBACK_PRICING,
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener el precio.' }, { status: 500 });
  }
}
