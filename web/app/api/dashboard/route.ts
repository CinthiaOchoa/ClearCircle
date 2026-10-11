import { NextResponse } from 'next/server';
import { authorized } from '../../../lib/session';
import { familySchema } from '../../../lib/family';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  if (!await authorized()) return NextResponse.json({ error: 'Sign in to view your family.' },{ status: 401, headers });
  try {
    const response = await fetch(`${process.env.CLEARCIRCLE_API_URL || 'http://127.0.0.1:8787'}/api/family`,{ cache: 'no-store', headers: { Authorization: `Bearer ${process.env.CLEARCIRCLE_API_TOKEN}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Unavailable');
    return NextResponse.json(familySchema.parse(await response.json()),{ headers });
  } catch { return NextResponse.json({ error: 'Cannot reach the family agent. Check that it is running, then refresh.' },{ status: 502, headers }); }
}
