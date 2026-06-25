'use client';

/**
 * DriverReferralsPanel — cargado de forma lazy en la tab "Refs" de Perfil
 * ──────────────────────────────────────────────────────────────────────────────
 * Extrae los onSnapshot de referidos fuera del componente principal de perfil.
 * Antes: profile/page.tsx abría este listener siempre al montar la página.
 * Ahora: solo se monta cuando el usuario visita la tab "Refs".
 *
 * NO TOCAR: wallet / refund / settlement / tarifa dinámica / matching / IA.
 */

import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { OFFICIAL_DRIVER_REGISTER_URL } from '@/config/urls';

export function DriverReferralsPanel() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();

  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  useEffect(() => {
    if (!user || !firestore) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(firestore, 'referrals'),
      where('referrerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReferrals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [user, firestore]);

  const handleGenerateCode = async () => {
    if (!firebaseApp || isGeneratingCode) return;
    setIsGeneratingCode(true);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const generate = httpsCallable<any, { referralCode: string }>(functions, 'generateReferralCodeV1');
      const result = await generate();
      if (result.data?.referralCode) {
        toast({ title: 'Código generado', description: 'Ya podés invitar a otros conductores.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'No pudimos generar tu código.' });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleShare = async () => {
    const code = profile?.referralCode;
    if (!code) { handleGenerateCode(); return; }
    const link = `${OFFICIAL_DRIVER_REGISTER_URL}&ref=${code}`;
    const text = `Sumate a manejar con VamO y ganá más 🚀\nRegistrate desde mi link:\n${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'VamO Conductor 🚀', text }); return; } catch (_) {}
    }
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: 'Código copiado' }))
      .catch(() => toast({ variant: 'destructive', title: 'Error al copiar' }));
  };

  return (
    <div className="space-y-6">
      {/* Código de referido */}
      <div className="bg-background/80 p-5 rounded-2xl border flex flex-col items-center gap-4 text-center">
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Código de referido</p>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black tracking-tight font-mono text-primary">
            {isGeneratingCode ? (
              <VamoIcon name="loader" className="animate-spin h-6 w-6 text-primary" />
            ) : (
              profile?.referralCode || 'SIN CÓDIGO'
            )}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 text-primary hover:bg-primary/10 rounded-full"
            onClick={handleShare}
            disabled={isGeneratingCode || !profile?.referralCode}
          >
            <VamoIcon name="share-2" className="h-5 w-5" />
          </Button>
        </div>
        {!profile?.referralCode && !isGeneratingCode ? (
          <Button variant="default" className="w-full h-12 font-bold rounded-xl" onClick={handleGenerateCode}>
            Generar mi Código
          </Button>
        ) : (
          <Button
            variant="default"
            className="w-full h-12 font-bold rounded-xl"
            onClick={handleShare}
            disabled={isGeneratingCode || !profile?.referralCode}
          >
            {isGeneratingCode ? 'Generando...' : 'Compartir Código'}
          </Button>
        )}
      </div>

      {/* Lista de referidos */}
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest px-1">
          Referidos ({referrals.length})
        </p>
        {loading ? (
          <Skeleton className="h-12 w-full rounded-xl" />
        ) : referrals.length === 0 ? (
          <div className="py-8 text-center bg-zinc-900/10 rounded-2xl border border-dashed border-white/5">
            <p className="text-xs text-muted-foreground">Aún no tienes referidos.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((ref: any) => (
              <div key={ref.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center',
                    ref.status === 'rewarded' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
                  )}>
                    <VamoIcon name="user" className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold truncate max-w-[120px]">
                      {ref.referredUserName || `Chofer ${ref.referredId?.substring(0, 6)}...`}
                    </span>
                    <span className={cn(
                      'text-[10px] font-bold uppercase',
                      ref.status === 'rewarded' ? 'text-green-500' : 'text-amber-500'
                    )}>
                      {ref.status === 'rewarded' ? '🏆 Acreditado' : '⏳ Pendiente'}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ref.createdAt?.toDate?.().toLocaleDateString() || '...'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
