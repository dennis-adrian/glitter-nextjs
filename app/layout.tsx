import type { Metadata } from 'next';

import { ClerkProvider } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';

import { Inter } from 'next/font/google';

import Navbar from '@/app/ui/navbar';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Festival Glitter',
  description: 'Un festival para que los artistas brillen',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="es">
        <body className={inter.className}>
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
