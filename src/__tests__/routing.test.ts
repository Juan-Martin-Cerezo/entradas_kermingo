import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

vi.mock('@/lib/db', () => ({
  db: {
    event: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'https://eventhub.app'));
}

describe('F3 ruteo por slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_PASSWORD;
  });

  it('rutas viejas sin slug redirigen 308 a la home (no hay evento por defecto)', async () => {
    for (const legacy of ['/admin', '/admin/asistentes', '/escaner']) {
      const res = await proxy(createRequest(`https://eventhub.app${legacy}`));
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://eventhub.app/');
    }
  });

});
