import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, SESSION_SECONDS, checkPassword, configured, makeSession } from '../../../lib/session';
export const runtime = 'nodejs';
// Bounded, per-process limiter for this single-family prototype; shared rate limiting is a production follow-up.
let failures = 0, resetAt = 0;
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (process.env.DASHBOARD_ORIGIN) return origin === process.env.DASHBOARD_ORIGIN;
  // Next may use an internal hostname for request.url. The browser's Host header
  // still names the public origin; cross-site browsers cannot override it.
  try {
    const url = new URL(origin);
    return ['http:','https:'].includes(url.protocol) && url.origin === origin && url.host === request.headers.get('host');
  } catch { return false; }
};
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' },{ status: 403 });
  if (!configured()) return NextResponse.json({ error: 'Private dashboard is not configured. You can explore the public walkthrough.' },{ status: 503 });
  if (Date.now() > resetAt) { failures = 0; resetAt = Date.now()+15*60_000; }
  if (failures >= 10) return NextResponse.json({ error: 'Too many attempts. Please try again in 15 minutes.' },{ status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 2048) return NextResponse.json({ error: 'Invalid request' },{ status: 413 });
  let password: unknown;
  try { password = (await request.json()).password; } catch { return NextResponse.json({ error: 'Invalid request' },{ status: 400 }); }
  if (typeof password !== 'string' || password.length > 256 || !checkPassword(password)) {
    failures++; return NextResponse.json({ error: 'Incorrect password. Try again.' },{ status: 401 });
  }
  failures = 0;
  (await cookies()).set(COOKIE,makeSession(),{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS });
  return NextResponse.json({ ok: true },{ headers: { 'Cache-Control': 'no-store' } });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' },{ status: 403 });
  (await cookies()).delete(COOKIE);
  return NextResponse.json({ ok: true },{ headers: { 'Cache-Control': 'no-store' } });
}
