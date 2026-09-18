import { NextResponse } from 'next/server';
import { getEventPricingBySlug, FALLBACK_PRICING } from '@/lib/pricing';
import { DEFAULT_EVENT_SLUG } from '@/lib/constants';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || DEFAULT_EVENT_SLUG;
    const pricing = await getEventPricingBySlug(slug);
    return NextResponse.json({
      slug,
      ticketPriceCents: pricing.ticketPriceCents,
      currency: pricing.currency,
      fallback: pricing === FALLBACK_PRICING,
    });
  } catch {
    return NextResponse.json({
      slug: DEFAULT_EVENT_SLUG,
      ticketPriceCents: FALLBACK_PRICING.ticketPriceCents,
      currency: FALLBACK_PRICING.currency,
      fallback: true,
    });
  }
}
