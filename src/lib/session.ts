import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export type Role = 'superadmin' | 'owner' | 'scanner';

export interface SessionPayload {
  eventId?: string;
  eventSlug?: string;
  role: Role;
  email?: string;
  exp: number; // Unix timestamp in seconds
}

export const SESSION_COOKIE_NAME = 'eventhub_session';
export const LEGACY_COOKIE_NAME = 'admin_session';

export function getAuthSecret(): string {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'eventhub-fallback-secret-for-dev-only-32chars';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function signSession(
  payload: Omit<SessionPayload, 'exp'> & { exp?: number },
  secret: string = getAuthSecret()
): Promise<string> {
  // exp defaults to 7 days from now
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const fullPayload: SessionPayload = { ...payload, exp };

  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${data}.${encodedSignature}`;
}

export async function verifySession(
  token: string,
  secret: string = getAuthSecret()
): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlToBytes(encodedSignature);
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, encoder.encode(data));
    if (!isValid) return null;

    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson) as SessionPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: Request | NextRequest): Promise<SessionPayload | null> {
  try {
    let token: string | undefined;

    if ('cookies' in request && typeof (request as NextRequest).cookies.get === 'function') {
      token = (request as NextRequest).cookies.get(SESSION_COOKIE_NAME)?.value;
    } else {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      token = match ? decodeURIComponent(match[1]) : undefined;
    }

    if (!token) return null;
    return await verifySession(token);
  } catch {
    return null;
  }
}
