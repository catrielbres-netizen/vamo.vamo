'use client';

import React from 'react';
import { useAppMode } from '@/hooks/useAppMode';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter, usePathname } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function TaxiStandLayout({ children }: { children: React.ReactNode }) {
  const { appMode, loading: appModeLoading } = useAppMode();
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!appModeLoading && !appMode.stopsPanelEnabled) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-950 border border-white/5 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-500 text-2xl">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black uppercase tracking-wider text-amber-500 italic">
              Módulo Reservado
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed font-medium">
              Este módulo está reservado para la versión municipal de VamO.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!mounted) {
    return <VamoFullScreenLoader label="Cargando..." />;
  }

  return (
    <React.Suspense fallback={<VamoFullScreenLoader label="Cargando interfaz..." />}>
      {children}
    </React.Suspense>
  );
}
