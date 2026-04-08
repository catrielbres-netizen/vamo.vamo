'use client';

import React, { useEffect } from 'react';
import { AdminNavbar } from './components/AdminNavbar';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  // 1. ALL HOOKS MUST BE AT THE TOP LEVEL (Before any conditional return)
  useEffect(() => {
    if (!loading && profile && profile.role !== 'admin') {
      const timer = setTimeout(() => {
        router.push('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, profile, router]);

  // Derived state for logic
  const isResolvingSession = loading || (!!user && !profile);
  const isAdmin = profile && profile.role === 'admin';

  // 2. Early returns are only safe AFTER all hooks have been declared
  
  // A. Loading state
  if (isResolvingSession) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse">Verificando acceso administrador</p>
        </div>
      </div>
    );
  }

  // B. NO SESSION
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121212] p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <VamoIcon name="lock" className="h-8 w-8 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Acceso Denegado</h2>
            <p className="text-zinc-500 text-sm">Debés iniciar sesión como administrador.</p>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700">
            Ir al Login
          </Button>
        </div>
      </div>
    );
  }

  // C. TRANSITION / WRONG ROLE
  if (profile && profile.role !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121212] p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <VamoIcon name="shield-off" className="h-8 w-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Acceso Denegado</h2>
            <p className="text-zinc-500 text-sm">No tenés permisos para acceder a esta sección.</p>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest mt-4">Redirigiendo al inicio...</p>
          </div>
        </div>
      </div>
    );
  }

  // D. SAFEGUARD (Wait for explicitly true isAdmin during transitions)
  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse text-center">Verificando acceso administrador</p>
        </div>
      </div>
    );
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full flex-col bg-transparent text-zinc-100 font-sans">
      <AdminNavbar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
