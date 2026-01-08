import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google'
import ClientProviders from './ClientProviders';

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VamO',
  description: 'Movete fácil, movete con VamO',
  manifest: '/manifest.webmanifest',
  themeColor: '#1A237E',

  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VamO',
  },

  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head />
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
