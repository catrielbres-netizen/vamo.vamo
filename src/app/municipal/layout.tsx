'use client';

import React from 'react';
import { useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { MunicipalNavbar } from './components/MunicipalNavbar';

export default function MunicipalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  // Gatekeeper Logic
  
  // 1. Loading state
  const isResolvingSession = loading || (!!user && !profile);
  if (isResolvingSession) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse uppercase">Verificando acceso municipal</p>
        </div>
      </div>
    );
  }

  // 2. NO SESSION
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121212] p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <VamoIcon name="lock" className="h-8 w-8 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Acceso Denegado</h2>
            <p className="text-zinc-500 text-sm">Debés iniciar sesión para acceder al panel municipal.</p>
          </div>
          <button 
            onClick={() => router.push('/municipal/login')} 
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-bold transition-colors"
          >
            Ir al Login Municipal
          </button>
        </div>
      </div>
    );
  }

  // 3. WRONG ROLE
  if (profile && profile.role !== 'admin_municipal') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121212] p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <VamoIcon name="alert-triangle" className="h-8 w-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Rol Incorrecto</h2>
            <p className="text-zinc-500 text-sm">Tu cuenta no tiene permisos municipales.</p>
          </div>
          <button 
            onClick={() => router.push('/municipal/login')} 
            className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold transition-colors"
          >
            Cambiar de Cuenta
          </button>
        </div>
      </div>
    );
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <MunicipalNavbar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
