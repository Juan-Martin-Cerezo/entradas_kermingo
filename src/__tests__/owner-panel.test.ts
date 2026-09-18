import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    promoter: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    purchase: { findMany: vi.fn() },
    ticket: { findMany: vi.fn() },
    eventConfig: { findUnique: vi.fn() },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { GET as referidosGET, POST as referidosPOST, PATCH as referidosPATCH, DELETE as referidosDELETE } from '@/app/api/admin/referidos/route';
import { GET as exportGET } from '@/app/api/admin/export/route';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { signSession } from '@/lib/auth';

const EVENT_A = 'event-a-uuid';
const EVENT_B = 'event-b-uuid';

async function authAsOwnerOf(eventId: string) {
  process.env.AUTH_SECRET = 'test-secret-key-for-owner-panel-32char';
  const token = await signSession({ role: 'owner', eventId, eventSlug: 'slug' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('F13 panel del owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-for-owner-panel-32char';
    delete process.env.ADMIN_PASSWORD;
    vi.mocked(db.eventConfig.findUnique).mockResolvedValue({
      ticket_price_cents: 500000,
      referral_commission_cents: 100000,
      currency: 'ARS',
    } as never);
  });

  it('ranking de promoters filtra por event_id', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.promoter.findMany).mockResolvedValue([]);

    const res = await referidosGET(new Request(`http://localhost/api/x?eventId=${EVENT_A}`));
    expect(res.status).toBe(200);
    expect(vi.mocked(db.promoter.findMany).mock.calls[0][0]?.where).toMatchObject({ event_id: EVENT_A });
  });

  it('alta de promoter queda scoped al evento y rechaza duplicado en el mismo evento', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.promoter.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p1' } as never);
    vi.mocked(db.promoter.create).mockResolvedValue({ id: 'p-new' } as never);

    const ok = await referidosPOST(
      new Request('http://localhost/api/x', {
        method: 'POST',
        body: JSON.stringify({ eventId: EVENT_A, name: 'Nueva Promotora', referralCode: 'NUEVA1' }),
      })
    );
    expect(ok.status).toBe(201);
    expect(vi.mocked(db.promoter.create).mock.calls[0][0]).toMatchObject({
      data: { event_id: EVENT_A, name: 'Nueva Promotora', referral_code: 'NUEVA1' },
    });

    const dup = await referidosPOST(
      new Request('http://localhost/api/x', {
        method: 'POST',
        body: JSON.stringify({ eventId: EVENT_A, name: 'Otra', referralCode: 'NUEVA1' }),
      })
    );
    expect(dup.status).toBe(409);
  });

  it('owner de A no puede editar ni borrar promoters de B', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.promoter.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.promoter.deleteMany).mockResolvedValue({ count: 0 });

    const edit = await referidosPATCH(
      new Request('http://localhost/api/x', {
        method: 'PATCH',
        body: JSON.stringify({ eventId: EVENT_B, promoterId: 'p-de-b', name: 'Hack' }),
      })
    );
    expect(edit.status).toBe(403);

    const del = await referidosDELETE(
      new Request('http://localhost/api/x', {
        method: 'DELETE',
        body: JSON.stringify({ eventId: EVENT_B, promoterId: 'p-de-b' }),
      })
    );
    expect(del.status).toBe(403);
  });

  it('editar y borrar promoter propio usa where compuesto (id + event_id)', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.promoter.findFirst).mockResolvedValue({ id: 'p1', event_id: EVENT_A } as never);
    vi.mocked(db.promoter.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.promoter.deleteMany).mockResolvedValue({ count: 1 });

    const edit = await referidosPATCH(
      new Request('http://localhost/api/x', {
        method: 'PATCH',
        body: JSON.stringify({ eventId: EVENT_A, promoterId: 'p1', name: 'Renombrada' }),
      })
    );
    expect(edit.status).toBe(200);
    expect(vi.mocked(db.promoter.updateMany).mock.calls[0][0]).toMatchObject({
      where: { id: 'p1', event_id: EVENT_A },
    });

    const del = await referidosDELETE(
      new Request('http://localhost/api/x', {
        method: 'DELETE',
        body: JSON.stringify({ eventId: EVENT_A, promoterId: 'p1' }),
      })
    );
    expect(del.status).toBe(200);
    expect(vi.mocked(db.promoter.deleteMany).mock.calls[0][0]).toMatchObject({
      where: { id: 'p1', event_id: EVENT_A },
    });
  });

  it('export CSV de ventas y asistentes filtra por event_id y devuelve text/csv', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.purchase.findMany).mockResolvedValue([
      {
        id: 'c1',
        buyer_email: 'a@test.com',
        quantity: 2,
        payment_status: 'APPROVED',
        attendee_names: '["Ana","Beto"]',
        createdAt: new Date('2026-09-01T10:00:00Z'),
        promoter: { name: 'Promo', referral_code: 'PROMO10' },
      },
    ] as never);
    vi.mocked(db.ticket.findMany).mockResolvedValue([
      {
        id: 't1',
        holder_name: 'Ana',
        entry_status: true,
        purchase: { buyer_email: 'a@test.com', promoter: { name: 'Promo' } },
      },
    ] as never);

    const ventas = await exportGET(new Request(`http://localhost/api/x?eventId=${EVENT_A}&tipo=ventas`));
    expect(ventas.status).toBe(200);
    expect(ventas.headers.get('content-type')).toContain('text/csv');
    const csvVentas = await ventas.text();
    expect(csvVentas).toContain('a@test.com');
    expect(vi.mocked(db.purchase.findMany).mock.calls[0][0]?.where).toMatchObject({ event_id: EVENT_A });

    const asistentes = await exportGET(new Request(`http://localhost/api/x?eventId=${EVENT_A}&tipo=asistentes`));
    expect(asistentes.status).toBe(200);
    const csvAsist = await asistentes.text();
    expect(csvAsist).toContain('Ana');
    expect(vi.mocked(db.ticket.findMany).mock.calls[0][0]?.where).toMatchObject({ event_id: EVENT_A });
  });

  it('export de otro evento = 403', async () => {
    await authAsOwnerOf(EVENT_A);
    const res = await exportGET(new Request(`http://localhost/api/x?eventId=${EVENT_B}&tipo=ventas`));
    expect(res.status).toBe(403);
  });
});
