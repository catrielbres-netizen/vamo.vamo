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

export function MunicipalLoginForm() {
  const router = useRouter();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!firestore) throw new Error("Firestore not initialized");
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (!userDoc.exists()) {
        await signOut(auth);
        setError("Acceso denegado. No existe perfil municipal para este usuario.");
        setLoading(false);
        return;
      }

      const profile = userDoc.data() as UserProfile;

      // [VamO PRO] Force refresh token to ensure custom claims are hydrated in the client
      try {
        await user.getIdToken(true);
        console.log("[AUTH_SESSION_HARDENING] Token refreshed successfully.");
      } catch (tokenErr) {
        console.warn("[AUTH_SESSION_HARDENING] Token refresh failed, proceeding with current session.", tokenErr);
      }

      // Roles permitidos para panel municipal
      const validMuniRoles = ['admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal', 'admin', 'superadmin'];
      
      if (!validMuniRoles.includes(profile.role)) {
        await signOut(auth);
        setError("Esta cuenta no tiene permisos municipales.");
        setLoading(false);
        return;
      }

      const redirectPath = (profile.role === 'admin' || profile.role === 'superadmin') 
        ? (profile.role === 'superadmin' ? '/admin/dashboard' : '/admin')
        : '/municipal/dashboard';

      console.log(`[AUTH_ROUTE_DEBUG] Municipal Login Success. Role: ${profile.role}. Redirecting to ${redirectPath}`);
      router.push(redirectPath);

    } catch (err: any) {
      console.error("Municipal Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("Error de autenticación municipal.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="space-y-4">
        <AuthInput
          label="Email Institucional"
          type="email"
          icon="mail"
          placeholder="admin@municipio.gob.ar"
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
          disabled={loading}
          className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98]"
        >
          {loading ? <VamoIcon name="loader" className="w-5 h-5 animate-spin" /> : "ACCESO INSTITUCIONAL"}
        </Button>
      </div>

      <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
        <p className="text-[10px] text-zinc-500 text-center font-medium leading-relaxed">
            Este acceso es exclusivo para personal municipal autorizado. Si sos pasajero o conductor, usá los portales correspondientes.
        </p>
      </div>
    </form>
  );
}
