import { db } from './db';

export interface EventPricing {
  ticketPriceCents: number;
  referralCommissionCents: number;
  currency: string;
}

export const FALLBACK_PRICING: EventPricing = {
  ticketPriceCents: 500000,
  referralCommissionCents: 100000,
  currency: 'ARS',
};

export function centsToMajor(cents: number): number {
  return cents / 100;
}

export function formatPrice(cents: number, locale = 'es-AR'): string {
  return centsToMajor(cents).toLocaleString(locale);
}

export async function getEventPricing(eventId: string): Promise<EventPricing> {
  try {
    const config = await db.eventConfig.findUnique({
      where: { event_id: eventId },
      select: {
        ticket_price_cents: true,
        referral_commission_cents: true,
        currency: true,
      },
    });
    if (!config) return FALLBACK_PRICING;
    return {
      ticketPriceCents: config.ticket_price_cents,
      referralCommissionCents: config.referral_commission_cents,
      currency: config.currency,
    };
  } catch {
    return FALLBACK_PRICING;
  }
}

export async function getEventPricingBySlug(slug: string): Promise<EventPricing> {
  try {
    const event = await db.event.findUnique({
      where: { slug },
      select: {
        id: true,
        config: {
          select: {
            ticket_price_cents: true,
            referral_commission_cents: true,
            currency: true,
          },
        },
      },
    });
    if (!event?.config) return FALLBACK_PRICING;
    return {
      ticketPriceCents: event.config.ticket_price_cents,
      referralCommissionCents: event.config.referral_commission_cents,
      currency: event.config.currency,
    };
  } catch {
    return FALLBACK_PRICING;
  }
}
