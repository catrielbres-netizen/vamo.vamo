import React from 'react';
import type { Metadata } from 'next';
import { Inter, Archivo } from 'next/font/google';
import { cn } from '@/lib/utils';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import ClientProviders from './ClientProviders';
import { VersionManager } from '@/components/VersionManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AIGuard } from '@/components/ai/AIGuard';
import { GlobalFooter } from '@/components/GlobalFooter';

import { PwaInstallGate } from '@/components/PwaInstallGate';


const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', weight: ['400', '600', '800', '900'] });

export const metadata: Metadata = {
  title: 'VamO PRO',
  description: 'Sistema Integral VamO',
  manifest: '/manifest.webmanifest',
  themeColor: '#000000',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VamO PRO',
  },
};

export const viewport = {
  themeColor: "#050816",
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
          'min-h-screen bg-background bg-morphic font-sans antialiased selection:bg-indigo-500/30',
          inter.variable,
          archivo.variable,
          inter.className
        )}
      >
        <ClientProviders>
          <PwaInstallGate>
            <ErrorBoundary>
              <div className="relative flex min-h-screen flex-col">
                <VersionManager />
                <main className="flex-1">{children}</main>
                <GlobalFooter />
                <AIGuard />
              </div>
            </ErrorBoundary>
          </PwaInstallGate>
        </ClientProviders>
        <Toaster />
      </body>
    </html>
  );
}
