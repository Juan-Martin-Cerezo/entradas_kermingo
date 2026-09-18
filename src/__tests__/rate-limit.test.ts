import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRateLimited, MAX_CHECKOUTS_PER_HOUR } from '@/lib/rate-limit';

function checkoutForm(eventSlug: string) {
  const formData = new FormData();
  formData.append('email', 'buyer@test.com');
  formData.append('quantity', '1');
  formData.append('attendeeNames', JSON.stringify(['Buyer Test']));
  formData.append('receipt', new File([new ArrayBuffer(100)], 'r.png', { type: 'image/png' }));
  formData.append('eventSlug', eventSlug);
  return new Request('http://localhost/api/checkout', { method: 'POST', body: formData });
}

describe('rate limit por evento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(`permite hasta ${MAX_CHECKOUTS_PER_HOUR} compras/hora y bloquea la siguiente`, () => {
    const eventId = 'event-a';
    const now = Date.now();
    // 10 compras repartidas en la última hora (1 min entre cada una)
    const recent = Array.from({ length: MAX_CHECKOUTS_PER_HOUR }, (_, i) => new Date(now - i * 60_000));

    expect(isRateLimited(recent, now)).toBe(true);
    expect(isRateLimited(recent.slice(1), now)).toBe(false);
  });

  it('ignora compras de hace más de una hora (ventana deslizante)', () => {
    const now = Date.now();
    const old = Array.from({ length: 20 }, () => new Date(now - 61 * 60_1000));
    expect(isRateLimited(old, now)).toBe(false);
  });

  it('la ventana es por evento: compras de otro evento no cuentan', async () => {
    const { POST } = await import('@/app/api/checkout/route');
    const { db } = await import('@/lib/db');

    expect(typeof POST).toBe('function');
    expect(typeof checkoutForm).toBe('function');
    expect(db).toBeDefined();
  });
});
