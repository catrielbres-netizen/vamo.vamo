'use client';

import React from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { MapsProvider } from '@/components/MapsProvider';
import { FirebaseProvider } from '@/firebase';
import { CancellationNoticeProvider } from '@/context/CancellationNoticeProvider'; // Import the new provider
import { ReferralTracker } from '@/components/ReferralTracker';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <FirebaseProvider>
        <MapsProvider>
          <ReferralTracker />
          <CancellationNoticeProvider>
            {children}
          </CancellationNoticeProvider>
        </MapsProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
