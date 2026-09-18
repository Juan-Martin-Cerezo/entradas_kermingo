import { cookies } from 'next/headers';
import argon2 from 'argon2';
import {
  Role,
  SessionPayload,
  getSessionFromCookies,
  LEGACY_COOKIE_NAME,
} from './session';

export type { Role, SessionPayload };
export {
  signSession,
  verifySession,
  getSessionFromCookies,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
} from './session';

/**
 * Hashes a plaintext password using argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an argon2id hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Verifies credentials against superadmin environment variables.
 */
export function verifySuperadminCredentials(email?: string, password?: string): boolean {
  const superadminEmail = process.env.SUPERADMIN_EMAIL;
  const superadminPassword = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  if (!superadminPassword || !password) {
    return false;
  }

  if (superadminEmail && email && email.toLowerCase() !== superadminEmail.toLowerCase()) {
    return false;
  }

  return password === superadminPassword;
}

/**
 * Checks if the current session is authorized for the given event and roles.
 *
 * @param eventId Optional event ID to enforce tenant isolation. If provided, session must match or be superadmin.
 * @param allowedRoles Allowed roles for this action. Defaults to ['owner', 'superadmin'].
 */
export async function checkAuth(
  eventId?: string,
  allowedRoles: Role[] = ['owner', 'superadmin']
): Promise<boolean> {
  const session = await getSessionFromCookies();

  // 1. Valid signed session
  if (session) {
    // Superadmin has access across all events
    if (session.role === 'superadmin') {
      return true;
    }

    // Check if role is allowed
    if (!allowedRoles.includes(session.role)) {
      return false;
    }

    // If eventId is specified, enforce tenant isolation
    if (eventId && session.eventId !== eventId) {
      return false;
    }

    return true;
  }

  // 2. Fallback check for legacy ADMIN_PASSWORD token (sha256 in admin_session cookie)
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    try {
      const cookieStore = await cookies();
      const legacyToken = cookieStore.get(LEGACY_COOKIE_NAME)?.value;
      if (legacyToken) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(adminPassword));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const expectedToken = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        if (legacyToken === expectedToken) {
          return true;
        }
      }
    } catch {
      // Cookies not accessible or error
    }
  }

  return false;
}

/**
 * Asserts that the current request has a valid session and meets role/event requirements.
 * Throws an Error if unauthorized.
 */
export async function assertAuth(
  eventId?: string,
  allowedRoles: Role[] = ['owner', 'superadmin']
): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new Error('Unauthorized: No active session');
  }

  if (session.role === 'superadmin') {
    return session;
  }

  if (!allowedRoles.includes(session.role)) {
    throw new Error(`Forbidden: Role '${session.role}' not permitted`);
  }

  if (eventId && session.eventId !== eventId) {
    throw new Error('Forbidden: Session does not belong to this event');
  }

  return session;
}
