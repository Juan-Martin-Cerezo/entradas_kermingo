import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cookies } from 'next/headers';
import {
  signSession,
  verifySession,
  signInviteToken,
  verifyInviteToken,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import {
  checkSignupRateLimit,
  clearSignupRateLimitState,
  MAX_SIGNUPS_PER_HOUR,
} from '@/lib/rate-limit';
import { RESERVED_SLUGS } from '@/lib/constants';
import { buildVerificationHtml } from '@/lib/mailer/templates';

// Mocks
vi.mock('@/lib/db', () => ({
  db: {
    event: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    eventOwner: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    eventConfig: {
      upsert: vi.fn(),
    },
  },
  __esModule: true,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/mailer', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ messageId: 'verify-msg-id' }),
}));

import { GET as registerStatusGET, POST as registerPOST } from '@/app/api/auth/register/route';
import { GET as verifyGET } from '@/app/api/auth/verify/route';
import { PATCH as wizardPATCH } from '@/app/api/auth/register/event/route';
import { GET as adminEventsGET } from '@/app/api/admin/events/route';
import { db } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/mailer';

const TEST_IP = '203.0.113.7';

function reqWithIp(url: string, init?: RequestInit, ip: string = TEST_IP): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-forwarded-for', ip);
  return new Request(url, { ...init, headers });
}

async function mockOwnerSession(eventId = 'ev-1', eventSlug = 'mi-evento-x1y2z3') {
  process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-abc';
  delete process.env.ADMIN_PASSWORD;
  const token = await signSession({
    role: 'owner',
    eventId,
    eventSlug,
    email: 'nuevo@dueno.com',
  });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
    set: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('F14 Registro self-service de dueños', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSignupRateLimitState();
    process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-abc';
    delete process.env.ADMIN_PASSWORD;
    process.env.ALLOW_SELF_SIGNUP = '1';
  });

  describe('GET /api/auth/register (estado del registro)', () => {
    it('reporta abierto con ALLOW_SELF_SIGNUP=1', async () => {
      process.env.ALLOW_SELF_SIGNUP = '1';
      const res = await registerStatusGET();
      expect(res.status).toBe(200);
      expect((await res.json()).open).toBe(true);
    });

    it('reporta cerrado con ALLOW_SELF_SIGNUP=0', async () => {
      process.env.ALLOW_SELF_SIGNUP = '0';
      const res = await registerStatusGET();
      expect((await res.json()).open).toBe(false);
    });

    it('reporta cerrado si la variable no existe', async () => {
      delete process.env.ALLOW_SELF_SIGNUP;
      const res = await registerStatusGET();
      expect((await res.json()).open).toBe(false);
    });
  });

  describe('POST /api/auth/register — gate ALLOW_SELF_SIGNUP', () => {
    it('CRITERIO: con 0 el registro está cerrado (403) y no toca la DB', async () => {
      process.env.ALLOW_SELF_SIGNUP = '0';
      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nuevo@dueno.com', password: 'Password123!' }),
        })
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/cerrado/i);
      expect(db.eventOwner.findUnique).not.toHaveBeenCalled();
      expect(db.event.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/register — validaciones', () => {
    it('rechaza email con formato inválido (400)', async () => {
      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'no-es-email', password: 'Password123!' }),
        })
      );
      expect(res.status).toBe(400);
    });

    it('rechaza password de menos de 8 caracteres (400)', async () => {
      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nuevo@dueno.com', password: 'corta' }),
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('8 caracteres');
    });

    it('rechaza email ya registrado (409)', async () => {
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({ id: 'owner-existente' } as never);
      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nuevo@dueno.com', password: 'Password123!' }),
        })
      );
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/register — éxito', () => {
    it('crea evento DRAFT + owner con hash argon2id + token de verificación, envía email y loguea como owner', async () => {
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);
      vi.mocked(db.event.findUnique).mockResolvedValue(null);
      vi.mocked(db.event.create).mockResolvedValue({
        id: 'ev-1',
        slug: 'mi-evento-x1y2z3',
        name: 'Mi primer evento',
        status: 'DRAFT',
      } as never);
      vi.mocked(db.eventOwner.create).mockImplementation(
        async (args: { data: { invite_token: string | null } }) =>
          ({
            id: 'owner-1',
            event_id: 'ev-1',
            email: 'nuevo@dueno.com',
            invite_token: args.data.invite_token,
          }) as never
      );

      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nuevo@dueno.com', password: 'Password123!' }),
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.event.status).toBe('DRAFT');
      expect(data.role).toBe('owner');
      expect(data.needsEventSetup).toBe(true);

      expect(db.eventOwner.create).toHaveBeenCalledWith({
        data: {
          event_id: 'ev-1',
          email: 'nuevo@dueno.com',
          password_hash: expect.stringMatching(/^\$argon2id\$/),
          invite_token: expect.any(String),
        },
      });

      const token = vi.mocked(db.eventOwner.create).mock.calls[0][0].data
        .invite_token as string;
      const verified = await verifyInviteToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.email).toBe('nuevo@dueno.com');
      expect(verified?.eventId).toBe('ev-1');

      expect(sendVerificationEmail).toHaveBeenCalledWith(
        'nuevo@dueno.com',
        'Mi primer evento',
        expect.stringContaining('/verificar?token=')
      );
      expect(res.cookies.get('eventhub_session')).toBeDefined();
    });

    it('reintenta el slug generado si colisiona con un evento existente', async () => {
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);
      vi.mocked(db.event.findUnique).mockResolvedValueOnce({ id: 'otro' } as never);
      vi.mocked(db.event.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.event.create).mockResolvedValue({
        id: 'ev-2',
        slug: 'mi-evento-segundo',
        name: 'Mi primer evento',
        status: 'DRAFT',
      } as never);
      vi.mocked(db.eventOwner.create).mockResolvedValue({ id: 'owner-2' } as never);

      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'otro@dueno.com', password: 'Password123!' }),
        })
      );
      expect(res.status).toBe(201);
      expect(db.event.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /api/auth/register — rate limit', () => {
    it(`CRITERIO: permite hasta ${MAX_SIGNUPS_PER_HOUR} registros/hora por IP y bloquea el siguiente (429)`, async () => {
      for (let i = 0; i < MAX_SIGNUPS_PER_HOUR; i++) {
        expect(checkSignupRateLimit(TEST_IP)).toBe(false);
      }
      expect(checkSignupRateLimit(TEST_IP)).toBe(true);

      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);
      const res = await registerPOST(
        reqWithIp('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'spam@dueno.com', password: 'Password123!' }),
        })
      );
      expect(res.status).toBe(429);
      expect(db.event.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/verify — verificación por email', () => {
    it('verifica el token, lo consume (un solo uso) y responde verificado', async () => {
      const token = await signInviteToken({
        email: 'nuevo@dueno.com',
        eventId: 'ev-1',
        eventSlug: 'mi-evento-x1y2z3',
      });
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({
        id: 'owner-1',
        email: 'nuevo@dueno.com',
        event_id: 'ev-1',
        invite_token: token,
        event: {
          id: 'ev-1',
          name: 'Mi primer evento',
          slug: 'mi-evento-x1y2z3',
        },
      } as never);
      vi.mocked(db.eventOwner.update).mockResolvedValue({ id: 'owner-1' } as never);

      const res = await verifyGET(
        new Request(`http://localhost/api/auth/verify?token=${encodeURIComponent(token)}`)
      );
      expect(res.status).toBe(200);
      expect((await res.json()).verified).toBe(true);
      expect(db.eventOwner.update).toHaveBeenCalledWith({
        where: { id: 'owner-1' },
        data: { invite_token: null },
      });
      const cookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(cookie).toBeDefined();
      const session = await verifySession(cookie!.value);
      expect(session?.role).toBe('owner');
      expect(session?.eventId).toBe('ev-1');
      expect(session?.eventSlug).toBe('mi-evento-x1y2z3');
    });

    it('un token ya usado falla (lookup en DB da null)', async () => {
      const token = await signInviteToken({
        email: 'nuevo@dueno.com',
        eventId: 'ev-1',
        eventSlug: 'mi-evento-x1y2z3',
      });
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);

      const res = await verifyGET(
        new Request(`http://localhost/api/auth/verify?token=${encodeURIComponent(token)}`)
      );
      expect(res.status).toBe(400);
    });

    it('un token expirado falla', async () => {
      const expired = await signInviteToken(
        { email: 'nuevo@dueno.com', eventId: 'ev-1', eventSlug: 'mi-evento-x1y2z3' },
        -100
      );
      const res = await verifyGET(
        new Request(`http://localhost/api/auth/verify?token=${encodeURIComponent(expired)}`)
      );
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/auth/register/event — wizard del primer evento', () => {
    it('sin sesión de owner responde 401', async () => {
      vi.mocked(cookies).mockResolvedValue({
        get: () => undefined,
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const res = await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Fiesta 2026', slug: 'fiesta-2026' }),
        })
      );
      expect(res.status).toBe(401);
    });

    it('actualiza nombre/slug/precio/alias del evento propio y refresca la sesión con el nuevo slug', async () => {
      await mockOwnerSession();
      vi.mocked(db.event.findUnique).mockResolvedValue(null);
      vi.mocked(db.event.update).mockResolvedValue({
        id: 'ev-1',
        slug: 'fiesta-2026',
        name: 'Fiesta 2026',
      } as never);
      vi.mocked(db.eventConfig.upsert).mockResolvedValue({} as never);

      const res = await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Fiesta 2026',
            slug: 'fiesta-2026',
            fecha: '2026-12-31',
            ticketPriceCents: 600000,
            payAlias: 'fiesta.pagos',
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.event.slug).toBe('fiesta-2026');
      expect(data.fecha).toBe('2026-12-31');
      expect(data.warnings.join(' ')).toContain('starts_at');

      expect(db.event.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: { name: 'Fiesta 2026', slug: 'fiesta-2026' },
      });
      expect(db.eventConfig.upsert).toHaveBeenCalledWith({
        where: { event_id: 'ev-1' },
        update: expect.objectContaining({
          ticket_price_cents: 600000,
          pay_alias: 'fiesta.pagos',
        }),
        create: expect.objectContaining({
          event: { connect: { id: 'ev-1' } },
        }),
      });
      expect(res.cookies.get('eventhub_session')).toBeDefined();
    });

    it('rechaza slug reservado del sistema (400)', async () => {
      await mockOwnerSession();
      const res = await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X', slug: 'registro' }),
        })
      );
      expect(res.status).toBe(400);
    });

    it('rechaza slug que pertenece a otro evento (409)', async () => {
      await mockOwnerSession();
      vi.mocked(db.event.findUnique).mockResolvedValue({ id: 'ev-ajeno' } as never);
      const res = await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X', slug: 'evento-ajeno' }),
        })
      );
      expect(res.status).toBe(409);
      expect(db.event.update).not.toHaveBeenCalled();
    });

    it('rechaza fecha inválida (400)', async () => {
      await mockOwnerSession();
      const res = await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X', slug: 'x-2026', fecha: 'no-es-fecha' }),
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe('CRITERIO: el owner nuevo solo ve sus eventos', () => {
    it('el wizard escribe únicamente el evento de la sesión (nunca un event_id ajeno)', async () => {
      await mockOwnerSession('ev-1', 'mi-evento-x1y2z3');
      vi.mocked(db.event.findUnique).mockResolvedValue(null);
      vi.mocked(db.event.update).mockResolvedValue({ id: 'ev-1' } as never);
      vi.mocked(db.eventConfig.upsert).mockResolvedValue({} as never);

      await wizardPATCH(
        new Request('http://localhost/api/auth/register/event', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Mío', slug: 'mio-2026' }),
        })
      );

      expect(db.event.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: expect.anything(),
      });
    });

    it('el owner no puede listar eventos de plataforma (solo superadmin, 401)', async () => {
      await mockOwnerSession('ev-1', 'mi-evento-x1y2z3');
      const res = await adminEventsGET();
      expect(res.status).toBe(401);
    });
  });

  describe('guardas de slug y mailer', () => {
    it("'registro' y 'verificar' son slugs reservados del sistema", () => {
      expect(RESERVED_SLUGS.has('registro')).toBe(true);
      expect(RESERVED_SLUGS.has('verificar')).toBe(true);
    });

    it('el email de verificación usa el link correcto, escapa el nombre y no menciona Kermingo', () => {
      const html = buildVerificationHtml('Fiesta <2026>', 'http://localhost/verificar?token=abc');
      expect(html).toContain('http://localhost/verificar?token=abc');
      expect(html).toContain('Fiesta &lt;2026&gt;');
      expect(html).not.toMatch(/kermingo/i);
    });
  });
});
