/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { AuthInput } from './AuthInput';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

export function DriverRegisterForm() {
  const router = useRouter();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cityKey, setCityKey] = useState<'rawson' | 'trelew' | 'comodoro'>('rawson');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

    setLoading(true);

    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("[DRIVER_REGISTER_BACKEND_SYNC_START] Calling completeDriverRegistrationV1...");
      
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(undefined, 'us-central1');

      // [VamO SECURITY FIX] Force token refresh to ensure callable receives full auth context
      try {
        console.log("[DRIVER_REGISTER_TOKEN_REFRESH] Forcing ID token refresh...");
        await user.getIdToken(true);
        console.log("[DRIVER_REGISTER_TOKEN_REFRESH_OK] Token refreshed.");
      } catch (tokenErr) {
        console.warn("[DRIVER_REGISTER_TOKEN_REFRESH_FAILED] Non-critical: Token refresh failed before sync.", tokenErr);
      }

      const completeRegistration = httpsCallable(functions, 'completeDriverRegistrationV1');

      try {
        await completeRegistration({
            cityKey: cityKey,
            city: cityKey.charAt(0).toUpperCase() + cityKey.slice(1)
        });
        console.log("[DRIVER_REGISTER_BACKEND_SYNC_OK] Backend sync successful.");
      } catch (backendErr: any) {
        console.error("[DRIVER_REGISTER_BACKEND_SYNC_FAILED] Backend function failed.", backendErr);
        const errorCode = backendErr.code || 'unknown';
        const errorMessage = backendErr.message || 'Error interno del servidor';
        setError(`Error de sincronización (${errorCode}): ${errorMessage}. Intentá iniciar sesión para continuar.`);
        setLoading(false);
        return;
      }

      await updateProfile(user, {
        displayName: "Conductor"
      });

      // Send Verification Email (Automatic)
      try {
        await sendEmailVerification(user);
      } catch (err) {
        console.warn("Failed to send automatic verification email:", err);
      }

      // Redirect to driver onboarding
      router.push('/driver/complete-profile');

    } catch (err: any) {
      console.error("Driver Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Este email ya está registrado como conductor.");
      } else {
        setError("Error al crear la cuenta. Intentá nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRegister} className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
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
                label="Repetir Email"
                type="email"
                icon="mail"
                placeholder="Confirmá tu email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
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
                required
            />
            <AuthInput
                label="Repetir Contraseña"
                type="password"
                icon="lock"
                placeholder="Confirmá tu contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
            />
        </div>

        <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Ciudad Operativa</label>
            <select 
                value={cityKey} 
                onChange={(e: any) => setCityKey(e.target.value)}
                className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                <option value="rawson" className="bg-zinc-900">Rawson / Playa Unión</option>
                <option value="trelew" className="bg-zinc-900">Trelew</option>
                <option value="comodoro" className="bg-zinc-900">Comodoro Rivadavia</option>
                <option value="parana" className="bg-zinc-900">Paraná</option>
            </select>
        </div>
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
          disabled={loading}
          className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98]"
        >
          {loading ? <VamoIcon name="loader" className="w-5 h-5 animate-spin" /> : "REGISTRARME COMO CONDUCTOR"}
        </Button>
        
        <Button 
          type="button"
          variant="ghost"
          onClick={() => router.push('/login/conductor')}
          className="w-full h-12 text-zinc-500 hover:text-white font-bold rounded-2xl"
        >
          YA TENGO CUENTA CONDUCTOR
        </Button>
      </div>
    </form>
  );
}
