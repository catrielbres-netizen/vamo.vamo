/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useState, useEffect } from 'react';
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

export function PassengerLoginForm() {
  const router = useRouter();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visualState, setVisualState] = useState<LoginState>('idle');
  const [error, setError] = useState<string | null>(null);

  // [VamO PRO RESILIENCE] Pre-fill email if provided via URL (Resume Flow)
  useEffect(() => {
    if (typeof window !== 'undefined') {
        const urlEmail = new URLSearchParams(window.location.search).get('email');
        if (urlEmail) {
            console.log(`[PASSENGER_AUTH_AUDIT][AUTH_RESUME_FLOW] Pre-filling email: ${urlEmail}`);
            setEmail(decodeURIComponent(urlEmail));
        }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (visualState !== 'idle' && visualState !== 'error') return;

    setError(null);
    setVisualState('validating');
    const startTime = Date.now();

    console.log(`[PASSENGER_UX_FLOW][LOGIN] step=validating visualState=${visualState} elapsedMs=0`);

    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      const user = userCredential.user;

      console.log(`[PASSENGER_AUTH_AUDIT][LOGIN_ATTEMPT] Email: ${email} uid=${user.uid}`);
      setVisualState('loadingProfile');
      console.log(`[PASSENGER_UX_FLOW][LOGIN] step=loadingProfile elapsedMs=${Date.now() - startTime}`);

      // 1. Fetch Profile to verify role
      if (!firestore) throw new Error("Firestore not initialized");
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (!userDoc.exists()) {
        console.warn(`[PASSENGER_AUTH_AUDIT][INVALID_SESSION] No profile found for ${user.uid}. Cleaning up...`);
        await signOut(auth);
        setError("No encontramos un perfil asociado a esta cuenta. Contactá a soporte.");
        setVisualState('error');
        return;
      }

      const profile = userDoc.data() as UserProfile;

      // 2. Role Validation: Passenger OR Admin
      const validRoles = ['passenger', 'admin'];
      if (!validRoles.includes(profile.role)) {
        console.warn(`[PASSENGER_AUTH_AUDIT][INVALID_ROLE] Wrong role ${profile.role} for passenger login. Cleaning up...`);
        await signOut(auth);
        setError("Esta cuenta no está registrada como pasajero. Usá el portal correcto.");
        setVisualState('error');
        return;
      }

      setVisualState('redirecting');
      const redirectTarget = profile.role === 'admin' ? '/admin' : (profile.registrationStatus === 'active' ? '/dashboard' : '/dashboard/complete-profile');
      
      console.log(`[PASSENGER_UX_FLOW][LOGIN] step=redirecting redirectTarget=${redirectTarget} elapsedMs=${Date.now() - startTime}`);
      console.log(`[PASSENGER_AUTH_AUDIT][LOGIN_SUCCESS] User ${user.uid} validated. Redirecting...`);

      router.replace(redirectTarget);

    } catch (err: any) {
      console.error("[PASSENGER_AUTH_AUDIT][LOGIN_FAILED]", err);
      const auth = getAuth();
      await signOut(auth); 
      
      let msg = "Error al iniciar sesión. Intentá nuevamente.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = "Email o contraseña incorrectos.";
      }
      
      setError(msg);
      setVisualState('error');
      console.log(`[PASSENGER_UX_FLOW][LOGIN] step=error errorCode=${err.code} elapsedMs=${Date.now() - startTime}`);
    }
  };

  if (visualState === 'loadingProfile' || visualState === 'redirecting') {
    return <VamoFullScreenLoader label={visualState === 'loadingProfile' ? "Preparando tu perfil..." : "Ingresando a VamO..."} />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <form onSubmit={handleLogin} className="space-y-6">
        <div className="space-y-4">
            <AuthInput
                label="Email"
                type="email"
                icon="mail"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={visualState === 'validating'}
                required
            />
            <AuthInput
                label="Contraseña"
                type="password"
                icon="lock"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={visualState === 'validating'}
                required
            />
        </div>

        {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 items-center animate-in shake duration-500">
            <VamoIcon name="alert-circle" className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs text-red-500 font-bold leading-tight">{error}</p>
            </div>
        )}

        <div className="flex flex-col gap-3">
            <Button 
            type="submit" 
            disabled={visualState === 'validating'}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/20 active:scale-[0.98]"
            >
            {visualState === 'validating' ? (
                <div className="flex items-center gap-2">
                    <VamoIcon name="loader" className="w-5 h-5 animate-spin" />
                    <span>VERIFICANDO...</span>
                </div>
            ) : "INICIAR SESIÓN"}
            </Button>
            
            <Button 
            type="button"
            variant="ghost"
            onClick={() => router.push('/pasajero/register')}
            disabled={visualState === 'validating'}
            className="w-full h-12 text-zinc-500 hover:text-white font-bold rounded-2xl"
            >
            ¿NO TENÉS CUENTA? CREALA ACÁ
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
    </div>
  );
}
