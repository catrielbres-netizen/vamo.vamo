'use client';

import React from 'react';
import { doc, Timestamp, collection, query, where } from 'firebase/firestore';
import { Ride, FapClaim } from '@/lib/types';
import { useDoc, useFirestore, useMemoFirebase, useUser, useCollection } from '@/firebase';
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
  
  const claimsQuery = useMemoFirebase(
    () => (firestore && rideId ? query(collection(firestore, 'fap_claims'), where('rideId', '==', rideId)) : null),
    [firestore, rideId]
  );
  const { data: claims, isLoading: isClaimsLoading } = useCollection<FapClaim>(claimsQuery);
  const existingClaim = claims?.[0];

  // Lógica para mostrar botón FAP: Solo si el viaje fue elegible (Conductor Express) y < 24h
  // Debug logs outside useMemo to ensure they run
  console.log("[FAP_DEBUG] Ride Status:", ride?.status);
  console.log("[FAP_DEBUG] Service Type:", ride?.serviceType);
  console.log("[FAP_DEBUG] Driver Subtype Snapshot:", (ride as any)?.driverSubtypeSnapshot);
  console.log("[FAP_DEBUG] FAP Eligible Flag:", ride?.completedRide?.fapEligible);

  // Everyone is eligible for VamO F.A.P. in the unified model
  const canReportFap = React.useMemo(() => {
    if (!ride || ride.status !== 'completed') return false;
    
    // In the unified model, all completed rides are eligible for assistance reporting
    const isFapEligible = ride.completedRide?.fapEligible === true || 
                          ride.status === 'completed';

    if (!isFapEligible) return false;

    // Time guard
    const ts = ride.completedAt || ride.settledAt || (ride.pricing as any)?.estimated?.calculatedAt;
    if (!ts) return false;

    const completedAt = (ts as any).toMillis ? (ts as any).toMillis() : new Date(ts as any).getTime();
    const now = Date.now();
    const hoursSinceCompletion = (now - completedAt) / (1000 * 60 * 60);
    
    return hoursSinceCompletion <= 168; // 1 week margin
  }, [ride]);

  React.useEffect(() => {
    // ... audit logging
  }, [ride, error, rideId, user?.uid]);

  // [VamO PRO] Context-aware back navigation - Move before early returns to fix React error #310
  const backPath = React.useMemo(() => {
    if (typeof window !== 'undefined') {
        return window.location.pathname.startsWith('/driver') ? '/driver/history' : '/dashboard/history';
    }
    return '/dashboard/history';
  }, []);

  if (isLoading) {
    return <div className="p-10 flex justify-center"><VamoIcon name="loader" className="animate-spin h-8 w-8 text-zinc-500" /></div>;
  }

  // --- ERROR/EMPTY HANDLING ---
  if (error || !ride) {
      return <div className="p-10 text-center text-zinc-500">No se pudo cargar el detalle del viaje.</div>;
  }

  const isDriver = user?.uid === (ride as any)?.driverId;

  return (
    <div className="max-w-md mx-auto pt-4 pb-12 px-4">
        <RideReceipt 
            ride={ride} 
            onClose={() => router.push(backPath)}
            closeLabel="Volver al Historial"
        />

        {canReportFap && !existingClaim && (
          isDriver ? (
            <div className="mt-8 p-6 bg-zinc-900 border border-white/5 rounded-2xl flex flex-col items-center text-center gap-4">
              <p className="text-zinc-400 text-sm">
                Para soporte del conductor, contactá a VamO por el canal oficial.
              </p>
            </div>
          ) : (
            <div className="mt-8 p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex flex-col items-center text-center gap-4">
              <div className="h-12 w-12 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                <ShieldAlert className="text-blue-500 h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-blue-100 font-semibold italic uppercase tracking-wider text-xs">Protección VamO F.A.P.</h3>
                <p className="text-zinc-400 text-sm">¿Ocurrió algún incidente durante tu viaje Express?</p>
              </div>
              <Button 
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 border-0"
                  onClick={() => setIsFapModalOpen(true)}
              >
                Reportar Incidente
              </Button>
              <p className="text-[10px] text-zinc-500 italic">
                * Válido solo dentro de las 24 horas posteriores al viaje.
              </p>
            </div>
          )
        )}

        {existingClaim && !isDriver && (
          <div className={`mt-8 p-6 border rounded-2xl flex flex-col gap-4 ${
            existingClaim.status === 'rejected' ? 'bg-red-500/5 border-red-500/10' :
            ['approved', 'paid'].includes(existingClaim.status) ? 'bg-emerald-500/5 border-emerald-500/10' :
            'bg-zinc-500/5 border-zinc-500/10'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`h-5 w-5 ${
                  existingClaim.status === 'rejected' ? 'text-red-500' :
                  ['approved', 'paid'].includes(existingClaim.status) ? 'text-emerald-500' :
                  'text-zinc-400'
                }`} />
                <h3 className="font-bold uppercase tracking-widest text-[10px] italic">Estado de Asistencia</h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                existingClaim.status === 'rejected' ? 'bg-red-500/20 text-red-500' :
                ['approved', 'paid'].includes(existingClaim.status) ? 'bg-emerald-500/20 text-emerald-500' :
                'bg-zinc-800 text-zinc-400'
              }`}>
                {existingClaim.status === 'pending' ? 'Pendiente' : 
                 existingClaim.status === 'rejected' ? 'Rechazado' :
                 existingClaim.status === 'approved' ? 'Aprobado' :
                 existingClaim.status === 'paid' ? 'Compensado' : 
                 existingClaim.status === 'reviewing' ? 'En Revisión' : 
                 existingClaim.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-zinc-400 text-xs italic">ID de Caso: <span className="text-zinc-200 font-mono">{existingClaim.caseId}</span></p>
              
              <div className={`p-3 border rounded-xl mt-2 ${
                existingClaim.status === 'rejected' ? 'bg-red-500/10 border-red-500/20' :
                ['approved', 'paid'].includes(existingClaim.status) ? 'bg-emerald-500/10 border-emerald-500/20' :
                'bg-zinc-800/50 border-white/5'
              }`}>
                {existingClaim.status === 'pending' && (
                    <p className="text-zinc-300 text-xs font-semibold">Tu reclamo fue recibido y será revisado por VamO.</p>
                )}
                {existingClaim.status === 'reviewing' && (
                    <p className="text-blue-400 text-xs font-semibold">Estamos analizando la información del viaje.</p>
                )}
                {existingClaim.status === 'approved' && (
                    <p className="text-emerald-500 text-xs font-semibold">Tu asistencia fue aprobada.</p>
                )}
                {existingClaim.status === 'rejected' && (
                    <>
                        <p className="text-red-500 text-xs font-semibold">El reclamo fue rechazado. Revisá el detalle.</p>
                        {existingClaim.rejectionReason && (
                            <p className="text-zinc-400 text-[10px] italic mt-1 leading-relaxed">"{existingClaim.rejectionReason}"</p>
                        )}
                    </>
                )}
                {existingClaim.status === 'paid' && (
                    <p className="text-emerald-500 text-xs font-semibold">Tu asistencia fue aprobada y compensada.</p>
                )}
              </div>
            </div>
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
