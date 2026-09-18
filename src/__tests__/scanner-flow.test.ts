import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    ticket: { findMany: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { GET as asistentesGET } from '@/app/api/admin/asistentes/route';
import { GET as eventGET } from '@/app/api/event/route';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { signSession } from '@/lib/auth';

const EVENT_A = 'event-a-uuid';

async function authAsOwnerOf(eventId: string) {
  process.env.AUTH_SECRET = 'test-secret-key-for-scanner-flow-32c';
  const token = await signSession({ role: 'owner', eventId, eventSlug: 'evento-a' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('flujo escáner scoped por evento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-for-scanner-flow-32c';
    delete process.env.ADMIN_PASSWORD;
  });

  it('asistentes incluye eventId en cada item (para stampar la base offline)', async () => {
    await authAsOwnerOf(EVENT_A);
    vi.mocked(db.ticket.findMany).mockResolvedValue([
      {
        id: 't1',
        event_id: EVENT_A,
        holder_name: 'Juan',
        entry_status: false,
        entry_date: null,
        purchase: { buyer_email: 'b@t.com', promoter: null },
      },
    ] as never);

    const res = await asistentesGET(new Request(`http://localhost/api/admin/asistentes?eventId=${EVENT_A}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0]).toMatchObject({ id: 't1', eventId: EVENT_A });
  });

  it('GET /api/event?slug= resuelve id + status del evento', async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: EVENT_A,
      slug: 'evento-a',
      name: 'Evento A',
      status: 'ON_SALE',
    } as never);

    const res = await eventGET(new Request('http://localhost/api/event?slug=evento-a'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: EVENT_A, slug: 'evento-a', status: 'ON_SALE' });
    expect(data).not.toHaveProperty('owner');
  });

  it('GET /api/event?slug= sin slug = 400; slug inexistente = 404', async () => {
    const resNoSlug = await eventGET(new Request('http://localhost/api/event'));
    expect(resNoSlug.status).toBe(400);

    vi.mocked(db.event.findUnique).mockResolvedValue(null);
    const res404 = await eventGET(new Request('http://localhost/api/event?slug=no-existe'));
    expect(res404.status).toBe(404);
  });
});
