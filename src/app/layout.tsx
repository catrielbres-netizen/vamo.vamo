
import React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import ClientProviders from './ClientProviders';


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VamO',
  description: 'Movete fácil, movete con VamO',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/vamo-logo.svg',
    apple: '/vamo-logo.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'VamO',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  }
};

export const viewport = {
  themeColor: '#1E293B',
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background bg-morphic font-sans antialiased selection:bg-indigo-500/30',
          inter.className
        )}
      >
        <ClientProviders>
          <div className="relative flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
          </div>
        </ClientProviders>
        <Toaster />
      </body>
    </html>
  );
}
