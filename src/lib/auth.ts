import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function checkAuth(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD env variable is not set');
    return false;
  }

  const expectedToken = crypto.createHash('sha256').update(adminPassword).digest('hex');
  
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;

  return token === expectedToken;
}
