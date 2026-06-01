'use client';

import React from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { MapsProvider } from '@/components/MapsProvider';
import { FirebaseProvider } from '@/firebase';
import { CancellationNoticeProvider } from '@/context/CancellationNoticeProvider'; // Import the new provider
import ReferralTracker from '@/components/ReferralTracker';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelemetryProvider } from '@/lib/telemetry/TelemetryProvider';
import { VamoThemeProvider } from '@/context/VamoThemeContext';

const queryClient = new QueryClient();

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <FirebaseProvider>
        <VamoThemeProvider>
          <TelemetryProvider>
            <QueryClientProvider client={queryClient}>
              <MapsProvider>
                <ReferralTracker />
                <CancellationNoticeProvider>
                  {children}
                </CancellationNoticeProvider>
              </MapsProvider>
            </QueryClientProvider>
          </TelemetryProvider>
        </VamoThemeProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
