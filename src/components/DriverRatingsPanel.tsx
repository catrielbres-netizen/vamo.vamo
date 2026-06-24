'use client';

/**
 * DriverRatingsPanel — cargado de forma lazy en la tab PRO de Perfil
 * ──────────────────────────────────────────────────────────────────────────────
 * Extrae los onSnapshot de ratings fuera del componente principal de perfil.
 * Antes: profile/page.tsx abría este listener siempre al montar la página.
 * Ahora: solo se monta cuando el usuario visita la tab "PRO", ahorrando
 * una lectura de Firestore + renderizado en el primer paint.
 *
 * NO TOCAR: wallet / refund / settlement / tarifa dinámica / matching / IA.
 */

import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function DriverRatingsPanel() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [recentRatings, setRecentRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(firestore, 'rides'),
      where('driverId', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rated = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r: any) => (!!r.driverFeedbackType || !!r.driverRatingByPassenger) && !!r.driverComments)
          .slice(0, 3);
        setRecentRatings(rated);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [user, firestore]);

  if (loading) {
    return <Skeleton className="h-20 w-full rounded-2xl" />;
  }

  if (recentRatings.length === 0) {
    return (
      <div className="p-6 bg-zinc-900/30 rounded-2xl border border-dashed border-white/5 text-center">
        <p className="text-xs text-zinc-500 font-medium">Aún no recibiste comentarios de pasajeros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentRatings.map((ride) => (
        <div key={ride.id} className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 hover:bg-zinc-950/60 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-0.5">
              {(() => {
                const isPositive = ride.driverFeedbackType === 'thumbs_up' || (ride.driverRatingByPassenger && ride.driverRatingByPassenger >= 4);
                return (
                  <VamoIcon
                    name={isPositive ? "thumbs-up" : "thumbs-down"}
                    className={cn(
                      'w-4 h-4',
                      isPositive ? 'text-emerald-400' : 'text-rose-500'
                    )}
                  />
                );
              })()}
            </div>
            <span className="text-[9px] font-bold text-zinc-600 uppercase">
              {ride.completedAt?.toDate?.().toLocaleDateString() || 'Reciente'}
            </span>
          </div>
          {ride.driverComments ? (
            <p className="text-xs text-zinc-300 italic leading-relaxed">"{ride.driverComments}"</p>
          ) : (
            <p className="text-[10px] text-zinc-600 font-bold uppercase italic">Sin comentarios</p>
          )}
        </div>
      ))}
    </div>
  );
}
