/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { AuthInput } from './AuthInput';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { UserProfile } from '@/lib/types';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

type LoginState = 'idle' | 'validating' | 'loadingProfile' | 'redirecting' | 'error';

export function DriverLoginForm() {
  const router = useRouter();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visualState, setVisualState] = useState<LoginState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (visualState !== 'idle' && visualState !== 'error') return;

    setError(null);
    setVisualState('validating');
    const startTime = Date.now();

    try {
      console.log(`[AUTH_LOGIN_ATTEMPT] Driver Email: ${email}`);
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      const user = userCredential.user;

      console.log(`[AUTH_STATE_CHANGED] Driver logged in: ${user.uid}`);

      if (!firestore) throw new Error("Firestore not initialized");
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (!userDoc.exists()) {
        console.warn(`[DRIVER_AUTH_AUDIT][INVALID_SESSION] No driver profile found for ${user.uid}. Cleaning up...`);
        await signOut(auth);
        setError("No encontramos un perfil de conductor asociado a esta cuenta.");
        setVisualState('error');
        return;
      }

      const profile = userDoc.data() as UserProfile;
      setVisualState('loadingProfile');
      console.log(`[DRIVER_UX_FLOW][LOGIN] step=loadingProfile elapsedMs=${Date.now() - startTime}`);

      // Role Validation: Driver OR Admin
      const validRoles = ['driver', 'admin'];
      if (!validRoles.includes(profile.role)) {
        console.warn(`[DRIVER_AUTH_AUDIT][INVALID_ROLE] Wrong role ${profile.role} for driver login. Cleaning up...`);
        await signOut(auth);
        setError("Esta cuenta no está registrada como conductor. Usá el portal de pasajeros.");
        setVisualState('error');
        return;
      }

      console.log(`[DRIVER_AUTH_AUDIT][LOGIN_SUCCESS] Driver ${user.uid} validated as ${profile.role}.`);

      setVisualState('redirecting');
      if (profile.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/driver');
      }

    } catch (err: any) {
      console.error("[DRIVER_AUTH_AUDIT][LOGIN_FAILED]", err);
      const auth = getAuth();
      await signOut(auth); 
      
      let msg = "Error al iniciar sesión. Intentá nuevamente.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = "Email o contraseña incorrectos.";
      }
      
      setError(msg);
      setVisualState('error');
      console.log(`[DRIVER_UX_FLOW][LOGIN] step=error errorCode=${err.code} elapsedMs=${Date.now() - startTime}`);
    }
  };

  if (visualState === 'loadingProfile' || visualState === 'redirecting') {
    return <VamoFullScreenLoader label={visualState === 'loadingProfile' ? "Preparando tu oficina..." : "Ingresando a VamO..."} />;
  }

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="space-y-4">
        <AuthInput
          label="Email Conductor"
          type="email"
          icon="mail"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <AuthInput
          label="Contraseña"
          type="password"
          icon="lock"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 items-center">
          <VamoIcon name="alert-circle" className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs text-red-500 font-bold leading-tight">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button 
          type="submit" 
          disabled={visualState === 'validating'}
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
        >
          {visualState === 'validating' ? (
            <div className="flex items-center gap-2">
                <VamoIcon name="loader" className="w-5 h-5 animate-spin" />
                <span>VERIFICANDO...</span>
            </div>
          ) : "INICIAR SESIÓN CONDUCTOR"}
        </Button>
        
        <Button 
          type="button"
          variant="outline"
          onClick={() => router.push('/registro/conductor')}
          className="w-full h-12 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl"
        >
          CREAR CUENTA CONDUCTOR
        </Button>
      </div>

      <div className="text-center pt-2">
        <button 
          type="button" 
          onClick={() => router.push('/recuperar')}
          className="text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>
    </form>
  );
}
