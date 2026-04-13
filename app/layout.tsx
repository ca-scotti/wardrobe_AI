import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vestia — Your AI Stylist',
  description: 'Build your dream wardrobe with AI guidance, one perfect piece at a time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
