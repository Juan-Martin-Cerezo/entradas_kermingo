import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    event: { findUnique: vi.fn() },
    promoter: { findUnique: vi.fn(), create: vi.fn() },
    purchase: { create: vi.fn(), aggregate: vi.fn() },
  },
}));

vi.mock('@/lib/storage', () => ({
  uploadReceipt: vi.fn(),
}));

import { POST } from '@/app/api/checkout/route';
import { db } from '@/lib/db';
import { uploadReceipt } from '@/lib/storage';
import { clearRateLimitState, MAX_CHECKOUTS_PER_HOUR } from '@/lib/rate-limit';

const EVENT_A = 'event-a-uuid';
const EVENT_B = 'event-b-uuid';

function checkoutForm(eventSlug: string, quantity = 1, ip = '1.2.3.4') {
  const formData = new FormData();
  formData.append('email', 'buyer@test.com');
  formData.append('quantity', String(quantity));
  formData.append(
    'attendeeNames',
    JSON.stringify(Array.from({ length: quantity }, (_, i) => `Buyer ${i + 1}`))
  );
  formData.append('receipt', new File([new ArrayBuffer(100)], 'r.png', { type: 'image/png' }));
  formData.append('eventSlug', eventSlug);
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: formData,
    headers: { 'x-forwarded-for': ip },
  });
}

function mockEventOnSale(config: { max_tickets?: number | null } | null = null) {
  vi.mocked(db.event.findUnique).mockImplementation(async (args: unknown) => {
    const slug = (args as { where: { slug: string } }).where.slug;
    if (slug === 'evento-a') return { id: EVENT_A, status: 'ON_SALE', config } as never;
    if (slug === 'evento-b') return { id: EVENT_B, status: 'ON_SALE', config } as never;
    return null;
  });
}

describe('F7 cuotas y rate limit por evento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
    vi.mocked(uploadReceipt).mockResolvedValue({ url: 'mock://receipt/1', key: 'k1', mode: 'mock' });
    vi.mocked(db.promoter.findUnique).mockResolvedValue(null);
    vi.mocked(db.promoter.create).mockImplementation(async (args: unknown) => ({
      id: 'promoter-1',
      ...(args as { data: object }).data,
    }) as never);
    vi.mocked(db.purchase.create).mockImplementation(async (args: unknown) => ({
      id: 'purchase-1',
      ...(args as { data: object }).data,
    }) as never);
    vi.mocked(db.purchase.aggregate).mockResolvedValue({ _sum: { quantity: 0 } } as never);
  });

  it(`la compra ${MAX_CHECKOUTS_PER_HOUR + 1} en la hora desde la misma IP → 429`, async () => {
    mockEventOnSale();

    for (let i = 0; i < MAX_CHECKOUTS_PER_HOUR; i++) {
      const res = await POST(checkoutForm('evento-a'));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(checkoutForm('evento-a'));
    expect(blocked.status).toBe(429);
    const data = await blocked.json();
    expect(data.error).toMatch(/hora/i);
  });

  it('la cuota es por evento: compras de otro evento no consumen el cupo', async () => {
    mockEventOnSale();

    for (let i = 0; i < MAX_CHECKOUTS_PER_HOUR; i++) {
      const res = await POST(checkoutForm('evento-a'));
      expect(res.status).toBe(200);
    }

    const other = await POST(checkoutForm('evento-b'));
    expect(other.status).toBe(200);
  });

  it('al llegar a max_tickets la venta se cierra sola (403)', async () => {
    mockEventOnSale({ max_tickets: 5 });
    vi.mocked(db.purchase.aggregate).mockResolvedValue({ _sum: { quantity: 5 } } as never);

    const res = await POST(checkoutForm('evento-a'));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/cupo|cerrada/i);
  });

  it('con cupo disponible la compra pasa (vendidos + cantidad <= max_tickets)', async () => {
    mockEventOnSale({ max_tickets: 5 });
    vi.mocked(db.purchase.aggregate).mockResolvedValue({ _sum: { quantity: 4 } } as never);

    const ok = await POST(checkoutForm('evento-a', 1));
    expect(ok.status).toBe(200);

    const over = await POST(checkoutForm('evento-a', 2, '9.9.9.9'));
    expect(over.status).toBe(403);
  });

  it('sin max_tickets configurado no hay tope de cupo', async () => {
    mockEventOnSale(null);

    const res = await POST(checkoutForm('evento-a'));
    expect(res.status).toBe(200);
  });
});
