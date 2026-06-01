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

export function TrafficLoginForm() {
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

      const tokenResult = await user.getIdTokenResult();
      const claims = tokenResult.claims;

      let profile: any = null;
      if (firestore) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          profile = userDoc.data();
        }
      }

      const { resolveUserRole } = await import('@/lib/utils');
      const resolvedRole = resolveUserRole(profile, claims);

      // Roles permitidos para panel de Tránsito
      const validTrafficRoles = [
        'admin',
        'superadmin',
        'traffic',
        'traffic_admin',
        'traffic_operator',
        'traffic_municipal',
        'admin_municipal',
        'municipal_admin',
      ];
      
      if (!resolvedRole || !validTrafficRoles.includes(resolvedRole)) {
        await signOut(auth);
        setError("Esta cuenta no tiene permisos para el área de Tránsito.");
        setLoading(false);
        return;
      }

      router.push('/traffic');

    } catch (err: any) {
      console.error("Traffic Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("Error de autenticación de tránsito.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="space-y-4">
        <AuthInput
          label="Email Agente de Tránsito"
          type="email"
          icon="shield"
          placeholder="agente@transito.gob.ar"
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
          {loading ? <VamoIcon name="loader" className="w-5 h-5 animate-spin" /> : "ACCESO OPERATIVO TRÁNSITO"}
        </Button>
      </div>

      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5">
        <p className="text-[10px] text-zinc-500 text-center font-bold uppercase tracking-widest leading-relaxed">
            Área Restringida - Control de Operaciones
        </p>
      </div>
    </form>
  );
}
