import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    purchase: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    ticket: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    promoter: { findUnique: vi.fn(), create: vi.fn() },
    eventConfig: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { GET as statsGET } from '@/app/api/admin/stats/route';
import { GET as purchasesGET } from '@/app/api/admin/purchases/route';
import { GET as asistentesGET } from '@/app/api/admin/asistentes/route';
import { POST as validatePOST } from '@/app/api/tickets/validate/route';
import { GET as receiptGET } from '@/app/api/admin/purchases/receipt/route';
import { POST as actionPOST } from '@/app/api/admin/action/route';
import { POST as checkoutPOST } from '@/app/api/checkout/route';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { signSession } from '@/lib/auth';

const EVENT_A = 'event-a-uuid';
const EVENT_B = 'event-b-uuid';

async function authAsOwnerOf(eventId: string) {
  process.env.AUTH_SECRET = 'test-secret-key-for-isolation-tests-32c';
  const token = await signSession({ role: 'owner', eventId, eventSlug: 'slug' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function authedGet(handler: (req: Request) => Promise<Response>, eventId: string) {
  return handler(new Request(`http://localhost/api/x?eventId=${eventId}`, { method: 'GET' }));
}

describe('Aislamiento entre eventos (event_id scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-for-isolation-tests-32c';
    delete process.env.ADMIN_PASSWORD;
    vi.mocked(db.eventConfig.findUnique).mockResolvedValue({
      ticket_price_cents: 500000,
      referral_commission_cents: 100000,
      currency: 'ARS',
    } as never);
  });

  it('stats de B no incluye compras de A (scoping por event_id)', async () => {
    await authAsOwnerOf(EVENT_B);
    vi.mocked(db.purchase.findMany).mockResolvedValue([]);

    const res = await authedGet(statsGET, EVENT_B);
    expect(res.status).toBe(200);

    const where = vi.mocked(db.purchase.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ event_id: EVENT_B });
  });

  it('owner de A recibe 401/403 al pedir stats de B', async () => {
    await authAsOwnerOf(EVENT_A);

    const res = await authedGet(statsGET, EVENT_B);
    expect([401, 403]).toContain(res.status);
  });

  it('purchases filtra por event_id', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.purchase.findMany).mockResolvedValue([]);

    const res = await authedGet(purchasesGET, EVENT_A);
    expect(res.status).toBe(200);

    const where = vi.mocked(db.purchase.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ event_id: EVENT_A });
  });

  it('asistentes filtra tickets por event_id', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.ticket.findMany).mockResolvedValue([]);

    const res = await authedGet(asistentesGET, EVENT_A);
    expect(res.status).toBe(200);

    const where = vi.mocked(db.ticket.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ event_id: EVENT_A });
  });

  it('validar ticket de A en escáner de B = TICKET NOT FOUND', async () => {
    vi.mocked(db.ticket.updateMany).mockImplementation(async (args: unknown) => {
      const where = (args as { where: { id: string; event_id?: string } }).where;
      if (where.event_id === EVENT_B) return { count: 0 };
      return { count: 1 };
    });
    vi.mocked(db.ticket.findUnique).mockResolvedValue(null);

    const req = new Request('http://localhost/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ ticketId: 'ticket-de-evento-a', eventId: EVENT_B }),
    });

    const res = await validatePOST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('TICKET NOT FOUND');

    const updateWhere = vi.mocked(db.ticket.updateMany).mock.calls[0][0]?.where;
    expect(updateWhere).toMatchObject({ event_id: EVENT_B });
  });

  it('receipt de otro evento = 404 (no filtra por id solo)', async () => {
    await authAsOwnerOf(EVENT_B);
    vi.mocked(db.purchase.findFirst).mockResolvedValue(null);

    const req = new Request('http://localhost/api/admin/purchases/receipt?id=purchase-de-A&eventId=' + EVENT_B);
    const res = await receiptGET(req);
    expect(res.status).toBe(404);

    const args = vi.mocked(db.purchase.findFirst).mock.calls[0][0];
    expect(args).toMatchObject({ where: { id: 'purchase-de-A', event_id: EVENT_B } });
  });

  it('action DELETE de otro evento = 404 (deleteMany scoped)', async () => {
    await authAsOwnerOf(EVENT_B);
    vi.mocked(db.purchase.deleteMany).mockResolvedValue({ count: 0 });

    const req = new Request('http://localhost/api/admin/action', {
      method: 'POST',
      body: JSON.stringify({ purchaseId: 'purchase-de-A', action: 'DELETE', eventId: EVENT_B }),
    });
    const res = await actionPOST(req);
    expect(res.status).toBe(404);

    const args = vi.mocked(db.purchase.deleteMany).mock.calls[0][0];
    expect(args).toMatchObject({ where: { id: 'purchase-de-A', event_id: EVENT_B } });
  });

  function checkoutForm(eventSlug: string, referralCode = 'DIBU23') {
    const formData = new FormData();
    formData.append('email', 'buyer@test.com');
    formData.append('quantity', '1');
    formData.append('referralCode', referralCode);
    formData.append('attendeeNames', JSON.stringify(['Buyer Test']));
    formData.append('receipt', new File([new ArrayBuffer(100)], 'r.png', { type: 'image/png' }));
    formData.append('eventSlug', eventSlug);
    return new Request('http://localhost/api/checkout', { method: 'POST', body: formData });
  }

  it('mismo referral_code en dos eventos crea promoters distintos (unique compuesto)', async () => {
    vi.mocked(db.event.findUnique).mockImplementation(async (args: unknown) => {
      const slug = (args as { where: { slug: string } }).where.slug;
      if (slug === 'evento-a') return { id: EVENT_A, status: 'ON_SALE' } as never;
      if (slug === 'evento-b') return { id: EVENT_B, status: 'ON_SALE' } as never;
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

    const resA = await checkoutPOST(checkoutForm('evento-a'));
    expect(resA.status).toBe(200);
    const resB = await checkoutPOST(checkoutForm('evento-b'));
    expect(resB.status).toBe(200);

    const promoterLookups = vi.mocked(db.promoter.findUnique).mock.calls.map((c) => c[0]);
    expect(promoterLookups).toContainEqual({
      where: { event_id_referral_code: { event_id: EVENT_A, referral_code: 'DIBU23' } },
    });
    expect(promoterLookups).toContainEqual({
      where: { event_id_referral_code: { event_id: EVENT_B, referral_code: 'DIBU23' } },
    });

    const createdPromoters = vi.mocked(db.promoter.create).mock.calls.map((c) => c[0]?.data);
    expect(createdPromoters.map((d) => (d as { event_id: string }).event_id).sort()).toEqual(
      [EVENT_A, EVENT_B].sort()
    );

    const purchases = vi.mocked(db.purchase.create).mock.calls.map((c) => c[0]?.data);
    expect(purchases[0]).toMatchObject({ event_id: EVENT_A });
    expect(purchases[1]).toMatchObject({ event_id: EVENT_B });
  });

  it('checkout sin eventSlug = 400; evento inexistente = 404; evento no ON_SALE = 403', async () => {
    const noSlug = new FormData();
    noSlug.append('email', 'b@t.com');
    noSlug.append('quantity', '1');
    noSlug.append('attendeeNames', JSON.stringify(['B']));
    noSlug.append('receipt', new File([new ArrayBuffer(10)], 'r.png', { type: 'image/png' }));
    const resNoSlug = await checkoutPOST(new Request('http://localhost/api/checkout', { method: 'POST', body: noSlug }));
    expect(resNoSlug.status).toBe(400);

    vi.mocked(db.event.findUnique).mockResolvedValue(null);
    const res404 = await checkoutPOST(checkoutForm('no-existe'));
    expect(res404.status).toBe(404);

    vi.mocked(db.event.findUnique).mockResolvedValue({ id: EVENT_A, status: 'DRAFT' } as never);
    const res403 = await checkoutPOST(checkoutForm('evento-a'));
    expect(res403.status).toBe(403);
  });
});
