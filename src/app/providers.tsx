
'use client';

import { FirebaseClientProvider } from '@/firebase';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
      <FirebaseClientProvider>
        {children}
      </FirebaseClientProvider>
  );
}
