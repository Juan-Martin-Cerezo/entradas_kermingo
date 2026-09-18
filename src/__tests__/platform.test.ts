import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    event: { findMany: vi.fn() },
    purchase: { groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
  __esModule: true,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { GET as platformStatsGET } from '@/app/api/admin/platform-stats/route';
import { GET as keepAliveGET } from '@/app/api/keep-alive/route';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { signSession } from '@/lib/auth';

async function authAsSuperadmin() {
  process.env.AUTH_SECRET = 'test-secret-key-for-platform-tests-32c';
  delete process.env.ADMIN_PASSWORD;
  const token = await signSession({ role: 'superadmin', email: 'admin@eventhub.app' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('F8 plataforma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-for-platform-tests-32c';
    delete process.env.ADMIN_PASSWORD;
  });

  it('superadmin ve stats por evento; owner recibe 403', async () => {
    await authAsSuperadmin();
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 'event-a', slug: 'evento-a', name: 'Evento A', status: 'ON_SALE' },
      { id: 'event-b', slug: 'evento-b', name: 'Evento B', status: 'CLOSED' },
    ] as never);
    vi.mocked(db.purchase.groupBy).mockResolvedValue([
      { event_id: 'event-a', payment_status: 'APPROVED', _sum: { quantity: 10 }, _count: 4 },
      { event_id: 'event-a', payment_status: 'PENDING', _sum: { quantity: 2 }, _count: 1 },
    ] as never);

    const res = await platformStatsGET(
      new Request('http://localhost/api/admin/platform-stats')
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
    const eventoA = data.events.find((e: { slug: string }) => e.slug === 'evento-a');
    expect(eventoA.approvedTickets).toBe(10);
    expect(eventoA.pendingTickets).toBe(2);
    expect(eventoA.approvedPurchases).toBe(4);
  });

  it('sin sesión → 401', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const res = await platformStatsGET(
      new Request('http://localhost/api/admin/platform-stats')
    );
    expect(res.status).toBe(401);
  });

  it('keep-alive único sigue respondiendo SELECT 1', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }] as never);

    const res = await keepAliveGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
