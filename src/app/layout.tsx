
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import ClientProviders from './ClientProviders';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VamO',
  description: 'Movete fácil, movete con VamO',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'VamO',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#1A237E',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="16x16" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.className
        )}
      >
        <ClientProviders>
          <div className="relative flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
        </ClientProviders>
      </body>
    </html>
  );
}
