import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    event: { findUnique: vi.fn(), findMany: vi.fn() },
    eventConfig: { findUnique: vi.fn() },
    purchase: { findMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    promoter: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { GET as statsGET } from '@/app/api/admin/stats/route';
import { POST as checkoutPOST } from '@/app/api/checkout/route';
import { getEventPricing } from '@/lib/pricing';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { signSession } from '@/lib/auth';

const DEMO_A = { id: 'demo-a-uuid', slug: 'demo-festival', name: 'Demo Festival' };
const DEMO_B = { id: 'demo-b-uuid', slug: 'demo-conferencia', name: 'Demo Conferencia' };

async function authAsOwnerOf(eventId: string) {
  process.env.AUTH_SECRET = 'test-secret-key-for-adaptability-32char';
  const token = await signSession({ role: 'owner', eventId, eventSlug: 'slug' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('Adaptabilidad: dos eventos demo conviven sin verse (F11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-for-adaptability-32char';
    delete process.env.ADMIN_PASSWORD;
  });

  it('cada evento lee su propio precio/moneda desde EventConfig', async () => {
    vi.mocked(db.eventConfig.findUnique).mockImplementation(async (args: unknown) => {
      const eventId = (args as { where: { event_id: string } }).where.event_id;
      if (eventId === DEMO_A.id) {
        return { ticket_price_cents: 500000, referral_commission_cents: 100000, currency: 'ARS' } as never;
      }
      return { ticket_price_cents: 1000000, referral_commission_cents: 200000, currency: 'ARS' } as never;
    });

    const pricingA = await getEventPricing(DEMO_A.id);
    const pricingB = await getEventPricing(DEMO_B.id);

    expect(pricingA.ticketPriceCents).toBe(500000);
    expect(pricingB.ticketPriceCents).toBe(1000000);
    expect(pricingA.ticketPriceCents).not.toBe(pricingB.ticketPriceCents);
  });

  it('compras del evento A no aparecen en stats del evento B', async () => {
    await authAsOwnerOf(DEMO_B.id);
    vi.mocked(db.eventConfig.findUnique).mockResolvedValue({
      ticket_price_cents: 1000000,
      referral_commission_cents: 200000,
      currency: 'ARS',
    } as never);
    vi.mocked(db.purchase.findMany).mockResolvedValue([]);

    const res = await statsGET(new Request(`http://localhost/api/x?eventId=${DEMO_B.id}`, { method: 'GET' }));
    expect(res.status).toBe(200);

    const where = vi.mocked(db.purchase.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ event_id: DEMO_B.id });
    expect(where).not.toMatchObject({ event_id: DEMO_A.id });
  });

  it('mismo referral_code funciona en ambos eventos demo (scoped por evento)', async () => {
    vi.mocked(db.event.findUnique).mockImplementation(async (args: unknown) => {
      const slug = (args as { where: { slug: string } }).where.slug;
      if (slug === DEMO_A.slug) return { id: DEMO_A.id, status: 'ON_SALE' } as never;
      if (slug === DEMO_B.slug) return { id: DEMO_B.id, status: 'ON_SALE' } as never;
      return null;
    });
    vi.mocked(db.promoter.findUnique).mockResolvedValue(null);
    vi.mocked(db.promoter.create).mockImplementation(async (args: unknown) => ({
      id: `promoter-${(args as { data: { event_id: string } }).data.event_id}`,
      ...(args as { data: object }).data,
    }) as never);
    vi.mocked(db.purchase.create).mockImplementation(async (args: unknown) => ({
      id: 'purchase-1',
      ...(args as { data: object }).data,
    }) as never);

    function checkoutForm(eventSlug: string) {
      const formData = new FormData();
      formData.append('email', 'buyer@test.com');
      formData.append('quantity', '1');
      formData.append('referralCode', 'PROMO10');
      formData.append('attendeeNames', JSON.stringify(['Buyer Test']));
      formData.append('receipt', new File([new ArrayBuffer(100)], 'r.png', { type: 'image/png' }));
      formData.append('eventSlug', eventSlug);
      return new Request('http://localhost/api/checkout', { method: 'POST', body: formData });
    }

    const resA = await checkoutPOST(checkoutForm(DEMO_A.slug));
    expect(resA.status).toBe(200);
    const resB = await checkoutPOST(checkoutForm(DEMO_B.slug));
    expect(resB.status).toBe(200);

    const lookups = vi.mocked(db.promoter.findUnique).mock.calls.map((c) => c[0]);
    expect(lookups).toContainEqual({
      where: { event_id_referral_code: { event_id: DEMO_A.id, referral_code: 'PROMO10' } },
    });
    expect(lookups).toContainEqual({
      where: { event_id_referral_code: { event_id: DEMO_B.id, referral_code: 'PROMO10' } },
    });
  });
});
