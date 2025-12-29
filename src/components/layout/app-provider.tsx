// @/components/layout/app-provider.tsx
'use client';

import { StoreProvider } from '@/lib/store';

export function AppProvider({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
