import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD environment variable is not set');
      return NextResponse.json({ error: 'Configuración de servidor incompleta.' }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
    }

    const sessionToken = crypto.createHash('sha256').update(adminPassword).digest('hex');

    const response = NextResponse.json({ success: true });
    
    // Set HttpOnly, Secure, SameSite=Strict cookie
    response.cookies.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
