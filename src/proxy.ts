import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { DEFAULT_EVENT_SLUG } from '@/lib/constants';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const RESERVED_SLUGS = new Set([
  'api',
  '_next',
  'static',
  'favicon.ico',
  'eventos',
  'admin',
  'escaner',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Check for scoped multi-tenant routes: /:slug/admin/:path* or /:slug/escaner/:path*
  const scopedMatch = pathname.match(/^\/([^/]+)\/(admin|escaner)(\/.*)?$/);

  if (scopedMatch) {
    const slug = scopedMatch[1];
    const section = scopedMatch[2] as 'admin' | 'escaner';
    const subpath = scopedMatch[3] || '';

    if (!RESERVED_SLUGS.has(slug)) {
      const session = await getSessionFromRequest(request);

      if (session) {
        // Superadmin has access to all events and routes
        if (session.role === 'superadmin') {
          return NextResponse.next();
        }

        // Tenant isolation: session eventSlug must match the route slug
        if (session.eventSlug && session.eventSlug !== slug) {
          return new NextResponse('Forbidden: Access denied to this event', { status: 403 });
        }

        // Section access control:
        // /:slug/admin/** requires 'owner' (or superadmin)
        if (section === 'admin' && session.role !== 'owner') {
          return new NextResponse('Forbidden: Owner access required', { status: 403 });
        }

        // /:slug/escaner/** requires 'owner' or 'scanner' (or superadmin)
        if (section === 'escaner' && session.role !== 'owner' && session.role !== 'scanner') {
          return new NextResponse('Forbidden: Scanner access required', { status: 403 });
        }

        return NextResponse.next();
      }

      // No active session:
      // Allow the base /:slug/admin page (where login form is displayed)
      if (section === 'admin' && (subpath === '' || subpath === '/')) {
        return NextResponse.next();
      }

      // Protect all other subroutes and escaner: redirect to event admin login
      return NextResponse.redirect(new URL(`/${slug}/admin`, request.url));
    }
  }

  // 2. Legacy route redirects: /admin*, /escaner* → /<default-slug>/... (308)
  const legacyRedirectMatch = pathname.match(/^\/(admin|escaner)(\/.*)?$/);
  if (legacyRedirectMatch && !pathname.startsWith('/api/')) {
    const section = legacyRedirectMatch[1];
    const subpath = legacyRedirectMatch[2] || '';
    return NextResponse.redirect(new URL(`/${DEFAULT_EVENT_SLUG}/${section}${subpath}`, request.url), 308);
  }

  // 3. Legacy route protection (kept for direct /api access patterns): /admin/asistentes, /admin/referidos, /escaner
  const isLegacyProtected =
    pathname.startsWith('/admin/asistentes') ||
    pathname.startsWith('/admin/referidos') ||
    pathname.startsWith('/escaner');

  if (isLegacyProtected) {
    const session = await getSessionFromRequest(request);
    if (session) {
      if (pathname.startsWith('/escaner')) {
        return NextResponse.next();
      }
      if (session.role === 'owner' || session.role === 'superadmin') {
        return NextResponse.next();
      }
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      const expectedToken = await sha256(adminPassword);
      const token = request.cookies.get('admin_session')?.value;
      if (token === expectedToken) {
        return NextResponse.next();
      }
    }

    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const middleware = proxy;

export const config = {
  matcher: [
    '/admin/:path*',
    '/escaner/:path*',
    '/admin/asistentes/:path*',
    '/admin/referidos/:path*',
    '/escaner/:path*',
    '/:slug/admin/:path*',
    '/:slug/escaner/:path*',
  ],
};
