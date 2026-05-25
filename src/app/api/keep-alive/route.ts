import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Perform a lightweight query to verify connection and keep Neon awake
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ success: true, message: 'Database active' });
  } catch (error: any) {
    console.error('Keep-alive ping failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
