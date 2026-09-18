import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cookies } from 'next/headers';
import {
  signSession,
  signInviteToken,
  verifyInviteToken,
  hashPassword,
} from '@/lib/auth';

// Mocks
vi.mock('@/lib/db', () => ({
  db: {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    eventOwner: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  __esModule: true,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/mailer', () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
  PLATFORM_FROM: '"EventHub" <noreply@eventhub.app>',
}));

import { POST as adminEventsPOST } from '@/app/api/admin/events/route';
import { GET as inviteGET } from '@/app/api/auth/invite/route';
import { POST as inviteAcceptPOST } from '@/app/api/auth/invite/accept/route';
import { POST as loginPOST } from '@/app/api/admin/login/route';
import { db } from '@/lib/db';
import { sendInviteEmail } from '@/lib/mailer';

async function mockSuperadminSession() {
  process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-abc';
  delete process.env.ADMIN_PASSWORD;
  const token = await signSession({ role: 'superadmin', email: 'superadmin@eventhub.app' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
    set: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('F6 Onboarding & Event Owner Invitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-abc';
    delete process.env.ADMIN_PASSWORD;
  });

  describe('Superadmin Event Creation & Invitation (POST /api/admin/events)', () => {
    it('requiere rol superadmin (sin sesión -> 401)', async () => {
      vi.mocked(cookies).mockResolvedValue({
        get: () => undefined,
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'rock-fest',
          name: 'Rock Fest 2026',
          ownerEmail: 'owner@rockfest.com',
        }),
      });

      const res = await adminEventsPOST(req);
      expect(res.status).toBe(401);
    });

    it('crea evento, config y owner con token de 24h, y envía email', async () => {
      await mockSuperadminSession();

      vi.mocked(db.event.findUnique).mockResolvedValue(null);
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);

      vi.mocked(db.event.create).mockResolvedValue({
        id: 'new-event-uuid',
        slug: 'rock-fest',
        name: 'Rock Fest 2026',
        status: 'DRAFT',
      } as never);

      vi.mocked(db.eventOwner.create).mockImplementation(async (args: { data: { invite_token: string | null } }) => ({
        id: 'owner-uuid',
        event_id: 'new-event-uuid',
        email: 'owner@rockfest.com',
        password_hash: '',
        invite_token: args.data.invite_token,
      }) as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'rock-fest',
          name: 'Rock Fest 2026',
          ownerEmail: 'owner@rockfest.com',
          ticketPriceCents: 650000,
        }),
      });

      const res = await adminEventsPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.event.slug).toBe('rock-fest');
      expect(data.owner.email).toBe('owner@rockfest.com');
      expect(data.inviteToken).toBeDefined();
      expect(data.inviteUrl).toContain('/invitacion?token=');

      // Verifica que el token generado es un token válido de invitación
      const verified = await verifyInviteToken(data.inviteToken);
      expect(verified).not.toBeNull();
      expect(verified?.email).toBe('owner@rockfest.com');
      expect(verified?.eventId).toBe('new-event-uuid');

      // Verifica llamada a mailer
      expect(sendInviteEmail).toHaveBeenCalledWith(
        'owner@rockfest.com',
        'Rock Fest 2026',
        expect.stringContaining('/invitacion?token=')
      );
    });

    it('rechaza slug reservado', async () => {
      await mockSuperadminSession();

      const req = new Request('http://localhost/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'admin',
          name: 'Admin Event',
          ownerEmail: 'test@example.com',
        }),
      });

      const res = await adminEventsPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('reservado');
    });

    it('rechaza slug ya existente (409)', async () => {
      await mockSuperadminSession();
      vi.mocked(db.event.findUnique).mockResolvedValue({ id: 'existing-id' } as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'demo-festival',
          name: 'Demo 2026',
          ownerEmail: 'new@eventhub.app',
        }),
      });

      const res = await adminEventsPOST(req);
      expect(res.status).toBe(409);
    });

    it('rechaza email de dueño duplicado (409)', async () => {
      await mockSuperadminSession();
      vi.mocked(db.event.findUnique).mockResolvedValue(null);
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({ id: 'existing-owner-id' } as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'nuevo-evento',
          name: 'Nuevo Evento',
          ownerEmail: 'already-registered@event.com',
        }),
      });

      const res = await adminEventsPOST(req);
      expect(res.status).toBe(409);
    });
  });

  describe('Verificación de Invitación (GET /api/auth/invite)', () => {
    it('valida token de invitación correctamente', async () => {
      const token = await signInviteToken({
        email: 'owner@party.com',
        eventId: 'party-event-id',
        eventSlug: 'party-2026',
      });

      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({
        id: 'owner-id',
        email: 'owner@party.com',
        event_id: 'party-event-id',
        invite_token: token,
        event: {
          name: 'Party 2026',
          slug: 'party-2026',
        },
      } as never);

      const req = new Request(`http://localhost/api/auth/invite?token=${encodeURIComponent(token)}`);
      const res = await inviteGET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.eventName).toBe('Party 2026');
      expect(data.email).toBe('owner@party.com');
    });

    it('falla si el token no existe en DB o ya fue consumido', async () => {
      const token = await signInviteToken({
        email: 'owner@party.com',
        eventId: 'party-event-id',
        eventSlug: 'party-2026',
      });

      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);

      const req = new Request(`http://localhost/api/auth/invite?token=${encodeURIComponent(token)}`);
      const res = await inviteGET(req);
      expect(res.status).toBe(400);
    });

    it('falla si el token ha expirado (> 24h)', async () => {
      // Firmar con exp en el pasado
      const expiredToken = await signInviteToken(
        { email: 'owner@party.com', eventId: 'party-event-id', eventSlug: 'party-2026' },
        -100 // Expirado hace 100 segundos
      );

      const req = new Request(`http://localhost/api/auth/invite?token=${encodeURIComponent(expiredToken)}`);
      const res = await inviteGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('expirado');
    });
  });

  describe('Aceptación de Invitación (POST /api/auth/invite/accept)', () => {
    it('setea password con argon2id, limpia invite_token (un solo uso) y loguea al owner', async () => {
      const token = await signInviteToken({
        email: 'owner@party.com',
        eventId: 'party-event-id',
        eventSlug: 'party-2026',
      });

      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({
        id: 'owner-id',
        email: 'owner@party.com',
        event_id: 'party-event-id',
        invite_token: token,
        event: {
          id: 'party-event-id',
          name: 'Party 2026',
          slug: 'party-2026',
        },
      } as never);

      vi.mocked(db.eventOwner.update).mockResolvedValue({
        id: 'owner-id',
        email: 'owner@party.com',
        event_id: 'party-event-id',
        invite_token: null,
      } as never);

      const req = new Request('http://localhost/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: 'superSecretOwnerPass2026!',
        }),
      });

      const res = await inviteAcceptPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.role).toBe('owner');
      expect(data.eventSlug).toBe('party-2026');

      // Verifica que el token se limpió a null (un solo uso)
      expect(db.eventOwner.update).toHaveBeenCalledWith({
        where: { id: 'owner-id' },
        data: {
          password_hash: expect.stringMatching(/^\$argon2id\$/),
          invite_token: null,
        },
      });

      // Verifica que setea la cookie de sesión
      expect(res.cookies.get('eventhub_session')).toBeDefined();
    });

    it('CRITERIO: token usado 2 veces falla', async () => {
      const token = await signInviteToken({
        email: 'owner@party.com',
        eventId: 'party-event-id',
        eventSlug: 'party-2026',
      });

      // Primer uso: ya consumió el token en DB (invite_token es null en la DB)
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue(null);

      const req = new Request('http://localhost/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: 'newPassword123!',
        }),
      });

      const res = await inviteAcceptPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('ya utilizada');
    });

    it('CRITERIO: dueño sin invitación no puede reclamar un evento ajeno', async () => {
      // Token para event-a
      const token = await signInviteToken({
        email: 'legit@event-a.com',
        eventId: 'event-a-id',
        eventSlug: 'event-a',
      });

      // Intentando asociar a owner de event-b
      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({
        id: 'attacker-owner-id',
        email: 'attacker@event-b.com',
        event_id: 'event-b-id', // Diferente evento!
        invite_token: token,
        event: {
          id: 'event-b-id',
          name: 'Event B',
          slug: 'event-b',
        },
      } as never);

      const req = new Request('http://localhost/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: 'maliciousPassword123!',
        }),
      });

      const res = await inviteAcceptPOST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('autorización');
    });

    it('rechaza contraseñas demasiado cortas (< 8 caracteres)', async () => {
      const req = new Request('http://localhost/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'dummy-token',
          password: 'short',
        }),
      });

      const res = await inviteAcceptPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('8 caracteres');
    });
  });

  describe('Login posterior del nuevo Owner en /api/admin/login', () => {
    it('el nuevo owner puede loguearse con su password configurada', async () => {
      const password = 'myFreshOwnerPassword2026!';
      const hash = await hashPassword(password);

      vi.mocked(db.eventOwner.findUnique).mockResolvedValue({
        id: 'owner-uuid',
        event_id: 'rock-event-uuid',
        email: 'owner@rockfest.com',
        password_hash: hash,
        invite_token: null, // Ya activada
        event: {
          id: 'rock-event-uuid',
          slug: 'rock-fest',
          name: 'Rock Fest 2026',
        },
      } as never);

      const req = new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'owner@rockfest.com',
          password,
          slug: 'rock-fest',
        }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.role).toBe('owner');
      expect(data.eventId).toBe('rock-event-uuid');
      expect(res.cookies.get('eventhub_session')).toBeDefined();
    });
  });
});
