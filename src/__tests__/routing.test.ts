import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

vi.mock('@/lib/db', () => ({
  db: {
    event: { findMany: vi.fn() },
  },
}));

import { GET as eventsGET } from '@/app/api/events/route';
import { db } from '@/lib/db';

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'https://eventhub.app'));
}

describe('F3 ruteo por slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_PASSWORD;
  });

  it('rutas viejas redirigen 308 a /kermingo-2026/...', async () => {
    for (const [legacy, target] of [
      ['/admin', '/kermingo-2026/admin'],
      ['/admin/asistentes', '/kermingo-2026/admin/asistentes'],
      ['/escaner', '/kermingo-2026/escaner'],
    ] as Array<[string, string]>) {
      const res = await proxy(createRequest(`https://eventhub.app${legacy}`));
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe(`https://eventhub.app${target}`);
    }
  });

  it('GET /api/events lista eventos ON_SALE sin exponer owner/config', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 'e1', slug: 'kermingo-2026', name: 'Kermingo 2026', status: 'ON_SALE' },
    ] as never);

    const res = await eventsGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([{ id: 'e1', slug: 'kermingo-2026', name: 'Kermingo 2026', status: 'ON_SALE' }]);

    const args = vi.mocked(db.event.findMany).mock.calls[0][0];
    expect(args?.where).toMatchObject({ status: 'ON_SALE' });
    expect(args?.select).not.toHaveProperty('owner');
    expect(args?.select).not.toHaveProperty('config');
  });
});
