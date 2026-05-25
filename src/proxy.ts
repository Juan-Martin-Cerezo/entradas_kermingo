import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const expectedToken = await sha256(adminPassword);
  const token = request.cookies.get('admin_session')?.value;

  const { pathname } = request.nextUrl;

  // Protect admin subroutes and scanner
  const isProtectedPath = 
    pathname.startsWith('/admin/asistentes') || 
    pathname.startsWith('/admin/referidos') || 
    pathname.startsWith('/escaner');

  if (isProtectedPath) {
    if (token !== expectedToken) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/asistentes/:path*',
    '/admin/referidos/:path*',
    '/escaner/:path*',
  ],
};
