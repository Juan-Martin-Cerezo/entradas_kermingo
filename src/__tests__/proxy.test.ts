import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/session';

describe('Proxy / Scoped Session Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTH_SECRET = 'test-secret-key-for-proxy-32-chars-long';
    process.env.ADMIN_PASSWORD = 'legacy-admin-password';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createRequest(url: string, cookieToken?: string): NextRequest {
    const headers = new Headers();
    if (cookieToken) {
      headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieToken)}`);
    }
    return new NextRequest(new URL(url, 'https://eventhub.app'), { headers });
  }

  describe('Multi-tenant Tenant Isolation & Scoping', () => {
    it('should return 403 when owner of event A accesses event B admin', async () => {
      const token = await signSession({
        role: 'owner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-b/admin', token);
      const res = await proxy(req);

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Forbidden');
    });

    it('should return 403 when owner of event A accesses event B admin subroutes', async () => {
      const token = await signSession({
        role: 'owner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-b/admin/asistentes', token);
      const res = await proxy(req);

      expect(res.status).toBe(403);
    });

    it('should allow owner of event A to access event A admin subroutes', async () => {
      const token = await signSession({
        role: 'owner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-a/admin/asistentes', token);
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('should allow superadmin to access any event admin', async () => {
      const token = await signSession({
        role: 'superadmin',
      });

      const reqA = createRequest('https://eventhub.app/event-a/admin/asistentes', token);
      const resA = await proxy(reqA);
      expect(resA.status).toBe(200);

      const reqB = createRequest('https://eventhub.app/event-b/admin/asistentes', token);
      const resB = await proxy(reqB);
      expect(resB.status).toBe(200);
    });

    it('should allow scanner of event A to access event A escaner', async () => {
      const token = await signSession({
        role: 'scanner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-a/escaner', token);
      const res = await proxy(req);

      expect(res.status).toBe(200);
    });

    it('should return 403 when scanner of event A accesses event A admin', async () => {
      const token = await signSession({
        role: 'scanner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-a/admin/asistentes', token);
      const res = await proxy(req);

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Owner access required');
    });

    it('should return 403 when scanner of event A accesses event B escaner', async () => {
      const token = await signSession({
        role: 'scanner',
        eventId: 'id-a',
        eventSlug: 'event-a',
      });

      const req = createRequest('https://eventhub.app/event-b/escaner', token);
      const res = await proxy(req);

      expect(res.status).toBe(403);
    });

    it('should redirect unauthenticated users from protected subroutes to event admin login', async () => {
      const req = createRequest('https://eventhub.app/event-a/admin/asistentes');
      const res = await proxy(req);

      expect(res.status).toBe(307); // NextResponse.redirect
      expect(res.headers.get('location')).toBe('https://eventhub.app/event-a/admin');
    });

    it('should allow unauthenticated users to access event admin login page directly', async () => {
      const req = createRequest('https://eventhub.app/event-a/admin');
      const res = await proxy(req);

      expect(res.status).toBe(200);
    });
  });

  describe('Rutas legacy sin slug (ya no existe evento por defecto)', () => {
    it('redirige /admin/asistentes sin sesión a la home', async () => {
      const req = createRequest('https://eventhub.app/admin/asistentes');
      const res = await proxy(req);

      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://eventhub.app/');
    });

    it('redirige /admin/asistentes incluso con sesión válida (no hay slug al que resolverlo)', async () => {
      const token = await signSession({ role: 'superadmin' });
      const req = createRequest('https://eventhub.app/admin/asistentes', token);
      const res = await proxy(req);

      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://eventhub.app/');
    });
  });
});
