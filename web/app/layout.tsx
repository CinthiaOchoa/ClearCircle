import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ClearCircle — Care, connected.',
  description: 'A family coordination agent for clearer next steps, right where you already talk.'
};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
