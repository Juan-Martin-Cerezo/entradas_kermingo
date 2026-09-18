import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    purchase: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    ticket: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
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
});
