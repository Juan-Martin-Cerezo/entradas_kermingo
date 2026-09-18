import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { signSession } from '@/lib/auth';

// Mocks
vi.mock('@/lib/db', () => ({
  db: {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    eventConfig: {
      upsert: vi.fn(),
    },
    eventOwner: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    purchase: {
      groupBy: vi.fn(),
    },
    ticket: {
      groupBy: vi.fn(),
    },
  },
  __esModule: true,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/mailer', () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ messageId: 'invite-msg-123' }),
}));

import { GET as platformStatsGET } from '@/app/api/admin/platform-stats/route';
import { PATCH as adminEventsPATCH } from '@/app/api/admin/events/route';
import { proxy } from '@/proxy';
import { db } from '@/lib/db';
import { sendInviteEmail } from '@/lib/mailer';

async function mockSuperadminSession() {
  process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-superadmin';
  delete process.env.ADMIN_PASSWORD;
  const token = await signSession({ role: 'superadmin', email: 'admin@eventhub.app' });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
    set: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
  return token;
}

async function mockOwnerSession(slug = 'rock-fest') {
  process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-superadmin';
  delete process.env.ADMIN_PASSWORD;
  const token = await signSession({
    role: 'owner',
    eventId: 'evt-rock',
    eventSlug: slug,
    email: 'owner@rock.com',
  });
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'eventhub_session' ? { value: token } : undefined),
    set: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
  return token;
}

describe('F12 Panel Superadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-key-32-chars-long-superadmin';
    delete process.env.ADMIN_PASSWORD;
  });

  describe('1. Métricas completas de plataforma (GET /api/admin/platform-stats)', () => {
    it('devuelve métricas con tickets vendidos, recaudado, tickets usados/válidos y % capacidad', async () => {
      await mockSuperadminSession();

      vi.mocked(db.event.findMany).mockResolvedValue([
        {
          id: 'evt-1',
          slug: 'fiesta-verano',
          name: 'Fiesta Verano',
          status: 'ON_SALE',
          createdAt: new Date('2026-01-01'),
          config: {
            event_id: 'evt-1',
            ticket_price_cents: 600000,
            referral_commission_cents: 100000,
            currency: 'ARS',
            pay_alias: 'fiesta.verano.mp',
            contact_email: 'fiesta@verano.com',
            max_tickets: 200,
            logo_url: null,
          },
          owner: {
            id: 'owner-1',
            email: 'organizador@verano.com',
            invite_token: null,
          },
        },
      ] as never);

      vi.mocked(db.purchase.groupBy).mockResolvedValue([
        { event_id: 'evt-1', payment_status: 'APPROVED', _sum: { quantity: 50 }, _count: 20 },
        { event_id: 'evt-1', payment_status: 'PENDING', _sum: { quantity: 5 }, _count: 2 },
      ] as never);

      vi.mocked(db.ticket.groupBy).mockResolvedValue([
        { event_id: 'evt-1', entry_status: true, _count: 35 },
        { event_id: 'evt-1', entry_status: false, _count: 15 },
      ] as never);

      const res = await platformStatsGET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.events).toHaveLength(1);

      const evt = data.events[0];
      expect(evt.slug).toBe('fiesta-verano');
      expect(evt.approvedTickets).toBe(50);
      expect(evt.revenueCents).toBe(30000000); // 50 * 600000 cents = $300,000
      expect(evt.usedTickets).toBe(35);
      expect(evt.validTickets).toBe(15);
      expect(evt.maxTickets).toBe(200);
      expect(evt.capacityOccupiedPercent).toBe(25); // (50 / 200) * 100 = 25%
    });

    it('bloquea a usuarios sin rol superadmin con 401', async () => {
      await mockOwnerSession();
      const res = await platformStatsGET();
      expect(res.status).toBe(401);
    });
  });

  describe('2. Edición y Gestión de Eventos (PATCH /api/admin/events)', () => {
    it('actualiza estado y configuración de un evento existente (abrir/cerrar ventas, precio, capacidad)', async () => {
      await mockSuperadminSession();

      vi.mocked(db.event.findUnique).mockResolvedValueOnce({
        id: 'evt-1',
        slug: 'fiesta-verano',
        name: 'Fiesta Verano',
        status: 'DRAFT',
        config: {
          event_id: 'evt-1',
          ticket_price_cents: 500000,
          referral_commission_cents: 100000,
          currency: 'ARS',
          pay_alias: 'viejo.alias',
          contact_email: null,
          max_tickets: 100,
          logo_url: null,
        },
        owner: { id: 'owner-1', email: 'owner@verano.com', invite_token: null },
      } as never).mockResolvedValueOnce({
        id: 'evt-1',
        slug: 'fiesta-verano',
        name: 'Fiesta Verano 2026',
        status: 'ON_SALE',
        config: {
          event_id: 'evt-1',
          ticket_price_cents: 750000,
          referral_commission_cents: 150000,
          currency: 'ARS',
          pay_alias: 'nuevo.alias.mp',
          contact_email: 'contacto@verano.com',
          max_tickets: 300,
          logo_url: 'https://logo.png',
        },
        owner: { id: 'owner-1', email: 'owner@verano.com', invite_token: null },
      } as never);

      vi.mocked(db.event.update).mockResolvedValue({ id: 'evt-1' } as never);
      vi.mocked(db.eventConfig.upsert).mockResolvedValue({ event_id: 'evt-1' } as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt-1',
          name: 'Fiesta Verano 2026',
          status: 'ON_SALE',
          ticketPriceCents: 750000,
          referralCommissionCents: 150000,
          currency: 'ARS',
          payAlias: 'nuevo.alias.mp',
          contactEmail: 'contacto@verano.com',
          maxTickets: 300,
          logoUrl: 'https://logo.png',
        }),
      });

      const res = await adminEventsPATCH(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.event.status).toBe('ON_SALE');
      expect(data.event.name).toBe('Fiesta Verano 2026');
      expect(data.event.config.ticket_price_cents).toBe(750000);
      expect(data.event.config.max_tickets).toBe(300);

      expect(db.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          name: 'Fiesta Verano 2026',
          status: 'ON_SALE',
        },
      });
      expect(db.eventConfig.upsert).toHaveBeenCalled();
    });

    it('reenvía invitación al owner cuando reinvite=true y dispara email', async () => {
      await mockSuperadminSession();

      vi.mocked(db.event.findUnique).mockResolvedValueOnce({
        id: 'evt-1',
        slug: 'fiesta-verano',
        name: 'Fiesta Verano',
        status: 'ON_SALE',
        config: null,
        owner: { id: 'owner-1', email: 'owner@verano.com', invite_token: 'token-viejo' },
      } as never).mockResolvedValueOnce({
        id: 'evt-1',
        slug: 'fiesta-verano',
        name: 'Fiesta Verano',
        status: 'ON_SALE',
        config: null,
        owner: { id: 'owner-1', email: 'owner@verano.com', invite_token: 'token-nuevo' },
      } as never);

      vi.mocked(db.eventOwner.update).mockResolvedValue({ id: 'owner-1' } as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt-1',
          reinvite: true,
        }),
      });

      const res = await adminEventsPATCH(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.inviteUrl).toContain('/invitacion?token=');
      expect(sendInviteEmail).toHaveBeenCalledWith(
        'owner@verano.com',
        'Fiesta Verano',
        expect.stringContaining('/invitacion?token=')
      );
    });

    it('rechaza estados no válidos con 400', async () => {
      await mockSuperadminSession();

      vi.mocked(db.event.findUnique).mockResolvedValue({
        id: 'evt-1',
        slug: 'fiesta-verano',
      } as never);

      const req = new Request('http://localhost/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt-1',
          status: 'INVALID_STATUS',
        }),
      });

      const res = await adminEventsPATCH(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Estado inválido/);
    });
  });

  describe('3. Protección de rutas en middleware (/panel y /panel/login)', () => {
    it('redirige /panel a /panel/login si el usuario no tiene sesión superadmin', async () => {
      const req = new NextRequest('http://localhost:3000/panel');
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/panel/login');
    });

    it('permite acceder a /panel/login sin sesión previa', async () => {
      const req = new NextRequest('http://localhost:3000/panel/login');
      const res = await proxy(req);

      expect(res.status).toBe(200);
    });

    it('permite ingresar a /panel si la sesión es superadmin', async () => {
      const token = await signSession({ role: 'superadmin', email: 'admin@eventhub.app' });
      const req = new NextRequest('http://localhost:3000/panel', {
        headers: { cookie: `eventhub_session=${token}` },
      });

      const res = await proxy(req);
      expect(res.status).toBe(200);
    });

    it('redirige /panel/login a /panel si ya está logueado como superadmin', async () => {
      const token = await signSession({ role: 'superadmin', email: 'admin@eventhub.app' });
      const req = new NextRequest('http://localhost:3000/panel/login', {
        headers: { cookie: `eventhub_session=${token}` },
      });

      const res = await proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/panel');
    });
  });
});
