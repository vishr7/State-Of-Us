import type { Metadata } from 'next';
import { Inter, Press_Start_2P } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const pressStart2P = Press_Start_2P({
  variable: '--font-press-start',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'State of US — Pittsburgh City Management',
  description: 'AI-powered city management simulation set in Pittsburgh, PA. Shape your city through housing, transit, and tax policy.',
  keywords: ['Pittsburgh', 'city management', 'simulation', 'AI', 'urban policy'],
  openGraph: {
    title: 'State of US — Pittsburgh',
    description: 'People. Policies. A Brighter Tomorrow.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${pressStart2P.variable}`}>
      <body className="overflow-hidden h-screen bg-navy-800">
        {children}
      </body>
    </html>
  );
}
