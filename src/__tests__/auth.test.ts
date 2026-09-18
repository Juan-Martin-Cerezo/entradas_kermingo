import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signSession,
  verifySession,
  hashPassword,
  verifyPassword,
  verifySuperadminCredentials,
  checkAuth,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { cookies } from 'next/headers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('Auth & Session System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.AUTH_SECRET = 'super-secret-test-auth-key-32-chars-long';
    process.env.SUPERADMIN_EMAIL = 'admin@eventhub.app';
    process.env.SUPERADMIN_PASSWORD = 'super-secure-admin-pass';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('JWT Session Signing & Verification', () => {
    it('should sign and successfully verify a session payload', async () => {
      const payload = {
        eventId: 'event-123',
        eventSlug: 'kermingo-2026',
        role: 'owner' as const,
        email: 'owner@kermingo.com',
      };

      const token = await signSession(payload);
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const verified = await verifySession(token);
      expect(verified).not.toBeNull();
      expect(verified?.eventId).toBe('event-123');
      expect(verified?.eventSlug).toBe('kermingo-2026');
      expect(verified?.role).toBe('owner');
      expect(verified?.email).toBe('owner@kermingo.com');
      expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should reject an expired session token', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      const payload = {
        eventId: 'event-123',
        role: 'owner' as const,
        exp: pastExp,
      };

      const token = await signSession(payload);
      const verified = await verifySession(token);
      expect(verified).toBeNull();
    });

    it('should reject a tampered token', async () => {
      const payload = {
        eventId: 'event-123',
        role: 'owner' as const,
      };

      const token = await signSession(payload);
      const parts = token.split('.');
      // Tamper payload
      parts[1] = Buffer.from(JSON.stringify({ role: 'superadmin' })).toString('base64url');
      const tampered = parts.join('.');

      const verified = await verifySession(tampered);
      expect(verified).toBeNull();
    });

    it('should reject verification with a different secret', async () => {
      const token = await signSession({ role: 'superadmin' });
      const verified = await verifySession(token, 'different-secret-key-that-does-not-match');
      expect(verified).toBeNull();
    });
  });

  describe('Argon2 Password Hashing & Verification', () => {
    it('should hash a password and verify it successfully', async () => {
      const password = 'mySecretEventPassword2026!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.startsWith('$argon2id$')).toBe(true);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword(hash, 'wrongPassword');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Superadmin Verification', () => {
    it('should verify superadmin with valid credentials', () => {
      expect(verifySuperadminCredentials('admin@eventhub.app', 'super-secure-admin-pass')).toBe(true);
    });

    it('should reject invalid password or email', () => {
      expect(verifySuperadminCredentials('admin@eventhub.app', 'wrong-pass')).toBe(false);
      expect(verifySuperadminCredentials('other@eventhub.app', 'super-secure-admin-pass')).toBe(false);
    });
  });

  describe('checkAuth Scoping & Tenant Isolation', () => {
    function mockCookieStore(cookieValue?: string) {
      const store = {
        get: vi.fn().mockImplementation((name: string) => {
          if (name === SESSION_COOKIE_NAME && cookieValue) {
            return { value: cookieValue };
          }
          return undefined;
        }),
      };
      vi.mocked(cookies).mockResolvedValue(store as any);
    }

    it('should allow superadmin for any eventId', async () => {
      const token = await signSession({ role: 'superadmin' });
      mockCookieStore(token);

      const canAccessEventA = await checkAuth('event-a');
      const canAccessEventB = await checkAuth('event-b');

      expect(canAccessEventA).toBe(true);
      expect(canAccessEventB).toBe(true);
    });

    it('should enforce tenant isolation for owner role', async () => {
      const token = await signSession({
        role: 'owner',
        eventId: 'event-a',
      });
      mockCookieStore(token);

      // Accessing own event
      const canAccessOwn = await checkAuth('event-a');
      expect(canAccessOwn).toBe(true);

      // Accessing different event (must be rejected!)
      const canAccessOther = await checkAuth('event-b');
      expect(canAccessOther).toBe(false);
    });

    it('should restrict scanner role from owner-only actions', async () => {
      const token = await signSession({
        role: 'scanner',
        eventId: 'event-a',
      });
      mockCookieStore(token);

      // Default checkAuth only allows ['owner', 'superadmin']
      const canAccessAdmin = await checkAuth('event-a');
      expect(canAccessAdmin).toBe(false);

      // When scanner is allowed, they can access their own event
      const canScanOwn = await checkAuth('event-a', ['owner', 'scanner']);
      expect(canScanOwn).toBe(true);

      // Scanner cannot scan other event
      const canScanOther = await checkAuth('event-b', ['owner', 'scanner']);
      expect(canScanOther).toBe(false);
    });
  });
});
