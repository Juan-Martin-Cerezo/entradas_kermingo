import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEventPricing, getEventPricingBySlug, FALLBACK_PRICING, centsToMajor } from '@/lib/pricing';
import { db } from '@/lib/db';
import type { EventConfig } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  db: {
    eventConfig: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}));

type ConfigSelect = Pick<EventConfig, 'ticket_price_cents' | 'referral_commission_cents' | 'currency'>;

describe('EventConfig pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('centsToMajor converts centavos to pesos', () => {
    expect(centsToMajor(500000)).toBe(5000);
    expect(centsToMajor(100000)).toBe(1000);
  });

  it('getEventPricing returns DB config in cents', async () => {
    vi.mocked(db.eventConfig.findUnique).mockResolvedValue({
      ticket_price_cents: 750000,
      referral_commission_cents: 150000,
      currency: 'ARS',
    } as ConfigSelect);

    const pricing = await getEventPricing('event-a');
    expect(pricing.ticketPriceCents).toBe(750000);
    expect(pricing.referralCommissionCents).toBe(150000);
    expect(db.eventConfig.findUnique).toHaveBeenCalledWith({
      where: { event_id: 'event-a' },
      select: {
        ticket_price_cents: true,
        referral_commission_cents: true,
        currency: true,
      },
    });
  });

  it('getEventPricing falls back when event has no config', async () => {
    vi.mocked(db.eventConfig.findUnique).mockResolvedValue(null);

    const pricing = await getEventPricing('event-unknown');
    expect(pricing).toEqual(FALLBACK_PRICING);
  });

  it('getEventPricingBySlug reads config through the event', async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: 'event-a',
      config: {
        ticket_price_cents: 600000,
        referral_commission_cents: 120000,
        currency: 'ARS',
      },
    } as { id: string; config: ConfigSelect });

    const pricing = await getEventPricingBySlug('fiesta-b');
    expect(pricing.ticketPriceCents).toBe(600000);
    expect(pricing.referralCommissionCents).toBe(120000);
  });
});
