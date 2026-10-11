import 'server-only';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
export const COOKIE = 'clearcircle-family';
export const SESSION_SECONDS = 8 * 60 * 60;
export const configured = () => (process.env.CLEARCIRCLE_API_TOKEN?.length ?? 0) >= 32 && (process.env.DASHBOARD_PASSWORD?.length ?? 0) >= 12;
const key = () => createHmac('sha256',process.env.CLEARCIRCLE_API_TOKEN!).update(`clearcircle-session:${process.env.DASHBOARD_PASSWORD}`).digest();
export const checkPassword = (password: string) => configured() && timingSafeEqual(createHash('sha256').update(password).digest(),createHash('sha256').update(process.env.DASHBOARD_PASSWORD!).digest());
export function makeSession(): string {
  const payload = `${Date.now()+SESSION_SECONDS*1000}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${createHmac('sha256',key()).update(payload).digest('hex')}`;
}
export async function authorized(): Promise<boolean> {
  if (!configured()) return false;
  const value = (await cookies()).get(COOKIE)?.value ?? '';
  const match = /^(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(value);
  if (!match || Number(match[1]) <= Date.now() || Number(match[1]) > Date.now()+SESSION_SECONDS*1000) return false;
  const expected = createHmac('sha256',key()).update(`${match[1]}.${match[2]}`).digest();
  return timingSafeEqual(Buffer.from(match[3],'hex'),expected);
}
