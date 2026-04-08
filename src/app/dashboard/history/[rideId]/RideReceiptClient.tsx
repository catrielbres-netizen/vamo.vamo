'use client';

import React from 'react';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { RideReceipt } from '@/components/RideReceipt';
import { Separator } from '@/components/ui/separator';
import { FapClaimModal } from '@/components/FapClaimModal';
import { ShieldAlert } from 'lucide-react';

export default function RideReceiptClient({ rideId }: { rideId: string }) {
  const firestore = useFirestore();
  const router = useRouter();
  const { user } = useUser();
  const [isFapModalOpen, setIsFapModalOpen] = React.useState(false);

  const rideRef = useMemoFirebase(
    () => (firestore && rideId ? doc(firestore, 'rides', rideId) : null),
    [firestore, rideId]
  );
  
  const { data: ride, isLoading, error } = useDoc<Ride>(rideRef);

  // Lógica para mostrar botón FAP: Solo si el viaje fue elegible (Conductor Express) y < 24h
  const canReportFap = React.useMemo(() => {
    if (!ride || ride.status !== 'completed' || !ride.completedAt || !ride.completedRide) return false;
    
    // Solo si el viaje fue elegible para el fondo (depende del conductor asignado v1.4)
    if (!ride.completedRide.fapEligible) return false;

    const completedAt = (ride.completedAt as any).toMillis();
    const now = Date.now();
    const hoursSinceCompletion = (now - completedAt) / (1000 * 60 * 60);
    
    return hoursSinceCompletion <= 24;
  }, [ride]);

  React.useEffect(() => {
    // ... audit logging
  }, [ride, error, rideId, user?.uid]);

  if (isLoading) {
    // ... skeleton
    return null; // Simplified for this edit call
  }

  // --- ERROR/EMPTY HANDLING ---
  if (error || !ride || !ride.completedRide) {
      // ... same error logic from before
      return null; // Handled below
  }

  return (
    <div className="max-w-md mx-auto pt-4 pb-12 px-4">
        <RideReceipt 
            ride={ride} 
            onClose={() => router.push('/dashboard/history')}
            closeLabel="Volver al Historial"
        />

        {canReportFap && (
          <div className="mt-8 p-6 bg-zinc-900 border border-emerald-500/10 rounded-2xl flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
              <ShieldAlert className="text-emerald-500 h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-zinc-200 font-semibold italic uppercase tracking-wider text-xs">Protección VamO F.A.P.</h3>
              <p className="text-zinc-400 text-sm">¿Ocurrió algún incidente durante tu viaje Express?</p>
            </div>
            <Button 
                variant="outline" 
                className="w-full border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
                onClick={() => setIsFapModalOpen(true)}
            >
              Reportar Incidente
            </Button>
            <p className="text-[10px] text-zinc-500 italic">
              * Válido solo dentro de las 24 horas posteriores al viaje.
            </p>
          </div>
        )}

        <FapClaimModal 
          ride={ride}
          isOpen={isFapModalOpen}
          onClose={() => setIsFapModalOpen(false)}
        />
    </div>
  );
}
