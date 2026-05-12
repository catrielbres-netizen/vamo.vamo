/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { useFirestore } from '@/firebase';
import { AuthInput } from './AuthInput';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

type RegisterState = 'idle' | 'validatingData' | 'creatingAccount' | 'creatingProfile' | 'preparingWallet' | 'redirecting' | 'error';

export function PassengerRegisterForm() {
  const router = useRouter();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visualState, setVisualState] = useState<RegisterState>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const isSubmitting = useRef(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting.current || visualState !== 'idle' && visualState !== 'error') return;

    setError(null);

    // 1. Validations
    if (email !== confirmEmail) {
        setError("Los correos electrónicos no coinciden.");
        return;
    }
    if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden.");
        return;
    }
    if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    if (!firestore) return;
    
    isSubmitting.current = true;
    setVisualState('validatingData');
    const startTime = Date.now();
    console.log("🚀 [PASSENGER_UX_FLOW][REGISTER] step=validatingData visualState=idle elapsedMs=0");

    try {
      const auth = getAuth();
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(undefined, 'us-central1');

      // 2. Auth Creation
      setVisualState('creatingAccount');
      console.log(`[PASSENGER_UX_FLOW][REGISTER] step=creatingAccount elapsedMs=${Date.now() - startTime}`);
      console.log("[PASSENGER_AUTH_AUDIT][AUTH_ATTEMPT] Creating Auth user...");
      
      const userCredential = await createUserWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      const user = userCredential.user;
      console.log("[PASSENGER_AUTH_AUDIT][AUTH_CREATED] Auth user created:", user.uid);

      // 3. Backend Registration [VamO PRO RESILIENCE]
      setVisualState('creatingProfile');
      console.log(`[PASSENGER_UX_FLOW][REGISTER] step=creatingProfile elapsedMs=${Date.now() - startTime}`);
      console.log("[PASSENGER_AUTH_AUDIT][BACKEND_SYNC_START] Calling completePassengerRegistrationV1...");
      
      // Force token refresh
      try {
        await user.getIdToken(true);
      } catch (tokenErr) {
        console.warn("[PASSENGER_AUTH_AUDIT][TOKEN_REFRESH_FAILED]", tokenErr);
      }

      const completeRegistration = httpsCallable(functions, 'completePassengerRegistrationV1');
      
      try {
        setVisualState('preparingWallet');
        console.log(`[PASSENGER_UX_FLOW][REGISTER] step=preparingWallet elapsedMs=${Date.now() - startTime}`);
        
        const result = await completeRegistration({
            device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        });
        console.log("[PASSENGER_AUTH_AUDIT][BACKEND_SYNC_OK] Backend sync successful:", result.data);
      } catch (backendErr: any) {
        console.warn("[PASSENGER_AUTH_AUDIT][BACKEND_SYNC_DELAYED] Backend sync failed but Auth exists. Proceeding to self-healing profile page.", backendErr);
        // No frenamos al usuario. El componente /complete-profile tiene lógica para crear el perfil si falta.
      }

      try {
        await sendEmailVerification(user);
        console.log("[PASSENGER_AUTH_AUDIT][VERIFICATION_SENT]");
      } catch (err) {
        console.warn("[PASSENGER_AUTH_AUDIT][VERIFICATION_FAILED]", err);
      }

      setVisualState('redirecting');
      console.log(`[PASSENGER_UX_FLOW][REGISTER] step=redirecting elapsedMs=${Date.now() - startTime}`);
      console.log(`[PASSENGER_AUTH_AUDIT][FLOW_SUCCESS] Registration took ${Date.now() - startTime}ms.`);

      window.location.href = '/dashboard/complete-profile';

    } catch (err: any) {
      console.error("[PASSENGER_AUTH_AUDIT][FLOW_FAILED]", err);
      isSubmitting.current = false;
      
      let msg = "Error al crear la cuenta. Intentá nuevamente.";
      if (err.code === 'auth/email-already-in-use') {
        msg = "Este email ya está registrado. Podés continuar tu registro iniciando sesión con tu contraseña.";
      } else if (err.code === 'auth/weak-password') {
        msg = "La contraseña es muy débil (mínimo 6 caracteres).";
      } else if (err.code === 'auth/invalid-email') {
        msg = "El formato del email no es válido.";
      }
      
      setError(msg);
      setVisualState('error');
      console.log(`[PASSENGER_UX_FLOW][REGISTER] step=error errorCode=${err.code} elapsedMs=${Date.now() - startTime}`);
    }
  };

  const handleGoToLogin = () => {
    router.push(`/login?email=${encodeURIComponent(email)}`);
  };

  if (visualState !== 'idle' && visualState !== 'error' && visualState !== 'validatingData') {
    let label = "Preparando VamO...";
    if (visualState === 'creatingAccount') label = "Creando tu cuenta segura...";
    if (visualState === 'creatingProfile') label = "Preparando tu perfil...";
    if (visualState === 'preparingWallet') label = "Activando tu billetera...";
    if (visualState === 'redirecting') label = "¡Todo listo! Ingresando...";
    
    return <VamoFullScreenLoader label={label} />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <form onSubmit={handleRegister} className="space-y-6">
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                <AuthInput
                    label="Email"
                    type="email"
                    icon="mail"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={visualState === 'validatingData'}
                    required
                />
                <AuthInput
                    label="Repetir Email"
                    type="email"
                    icon="mail"
                    placeholder="Confirmá tu email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    disabled={visualState === 'validatingData'}
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AuthInput
                    label="Contraseña"
                    type="password"
                    icon="lock"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={visualState === 'validatingData'}
                    required
                />
                <AuthInput
                    label="Repetir Contraseña"
                    type="password"
                    icon="lock"
                    placeholder="Confirmá tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={visualState === 'validatingData'}
                    required
                />
            </div>
        </div>

        {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3 animate-in shake duration-500">
            <div className="flex gap-3 items-start">
                <VamoIcon name="alert-circle" className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-500 font-bold leading-tight">{error}</p>
            </div>
            {error.includes("ya está registrado") && (
                <Button 
                type="button"
                onClick={handleGoToLogin}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl"
                >
                IR A INICIAR SESIÓN →
                </Button>
            )}
            </div>
        )}

        <div className="flex flex-col gap-3">
            <Button 
            type="submit" 
            disabled={visualState === 'validatingData'}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
            >
            {visualState === 'validatingData' ? (
                 <div className="flex items-center gap-2">
                    <VamoIcon name="loader" className="w-5 h-5 animate-spin" />
                    <span>PROCESANDO...</span>
                </div>
            ) : "CREAR CUENTA Y CONTINUAR"}
            </Button>
            
            <Button 
            type="button"
            variant="ghost"
            onClick={() => router.push('/login')}
            className="w-full h-12 text-zinc-500 hover:text-white font-bold rounded-2xl"
            >
            YA TENGO CUENTA PASAJERO
            </Button>
        </div>
        </form>
    </div>
  );
}
