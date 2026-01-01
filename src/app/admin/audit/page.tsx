// src/app/admin/audit/page.tsx
'use client'

import { useCollection, useMemoFirebase, useUser } from '@/firebase'
import { collection, query, where, doc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Ride, AuditLog } from '@/lib/types'
import { WithId } from '@/firebase/firestore/use-collection'
import { AlertTriangle, Bot, Check, User, Car, Calendar, DollarSign, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Timestamp } from 'firebase/firestore'

function formatCurrency(value: number | null | undefined) {
    if (typeof value !== 'number') return '$...';
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(value);
}

const RideAuditCard = ({ ride, onAudit }: { ride: WithId<Ride>, onAudit: (rideId: string) => void }) => {
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                           Viaje a {ride.destination.address}
                        </CardTitle>
                        <CardDescription>
                            {ride.finishedAt ? (ride.finishedAt as Timestamp).toDate().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Fecha no disponible'}hs
                        </CardDescription>
                    </div>
                    <span className="text-lg font-bold text-primary">{formatCurrency(ride.pricing.finalTotal)}</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-2"><User className="w-4 h-4"/> Pasajero: {ride.passengerName}</span>
                    <span className="flex items-center gap-2"><Car className="w-4 h-4"/> Conductor: {ride.driverName}</span>
                </div>
                 <div className="flex items-center justify-between text-muted-foreground text-xs">
                    <span className="flex items-center gap-2"><Route className="w-4 h-4"/> {((ride.pricing.estimatedDistanceMeters || 0) / 1000).toFixed(1)} km</span>
                    <span className="flex items-center gap-2"><Calendar className="w-4 h-4"/> {Math.round((ride.pricing.estimatedDurationSeconds || 0) / 60)} min</span>
                 </div>
                <div className="!mt-4 bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 p-3">
                    <p className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4"/> Alerta de la IA:</p>
                    <p className="text-yellow-800 dark:text-yellow-300">{ride.auditComment}</p>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={() => onAudit(ride.id)}>
                    <Check className="mr-2"/> Marcar como Auditado
                </Button>
            </CardFooter>
        </Card>
    )
}


export default function AdminAuditPage() {
  const db = useFirestore()
  const { user, profile: adminProfile } = useUser()
  const { toast } = useToast()
  
  const flaggedRidesQuery = useMemoFirebase(
    () => db ? query(
        collection(db, 'rides'), 
        where('audited', '==', false),
        where('auditComment', '!=', null)
    ) : null, 
    [db]
  );

  // We need to use a separate state to manage the UI, because real-time updates can be slow
  const { data: rides, isLoading } = useCollection<Ride>(flaggedRidesQuery)
  const [displayedRides, setDisplayedRides] = React.useState<WithId<Ride>[]>([]);

  React.useEffect(() => {
    if (rides) {
        setDisplayedRides(rides);
    }
  }, [rides]);

  const handleAuditRide = async (rideId: string) => {
    if (!db || !user?.uid || !adminProfile?.name) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la acción. Faltan datos del administrador.' });
        return;
    }

    const rideRef = doc(db, 'rides', rideId);
    const auditLogRef = collection(db, 'auditLogs');

    try {
        // Optimistically remove from UI
        setDisplayedRides(prev => prev.filter(r => r.id !== rideId));

        await updateDoc(rideRef, {
            audited: true,
            updatedAt: serverTimestamp(),
        });
        
        const logEntry: Omit<AuditLog, 'timestamp' | 'details'> = {
            adminId: user.uid,
            adminName: adminProfile.name,
            action: 'ride_marked_as_audited',
            entityId: rideId,
        };
        await addDoc(auditLogRef, { ...logEntry, timestamp: serverTimestamp(), details: `El viaje fue marcado como auditado por ${adminProfile.name}.` });

        toast({
            title: 'Viaje Auditado',
            description: 'El viaje ha sido marcado como revisado y no aparecerá más en esta lista.',
        });
    } catch(e) {
        console.error("Error auditing ride:", e);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el viaje.' });
        // If error, bring the ride back to the UI
        if(rides) setDisplayedRides(rides);
    }
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-2">
             <AlertTriangle className="h-8 w-8 text-yellow-500"/>
             <div>
                <h1 className="text-3xl font-bold">Auditoría de Viajes</h1>
                <p className="text-muted-foreground">Viajes marcados como sospechosos por la IA para su revisión.</p>
             </div>
        </div>
        
        {isLoading && <p>Buscando viajes para auditar...</p>}

        {!isLoading && displayedRides.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedRides.map(ride => (
                    <RideAuditCard key={ride.id} ride={ride} onAudit={handleAuditRide} />
                ))}
            </div>
        ) : !isLoading && (
            <div className="text-center py-16 border-dashed border-2 rounded-lg">
                <Check className="mx-auto h-12 w-12 text-green-500" />
                <h2 className="mt-4 text-xl font-semibold">¡Todo en orden!</h2>
                <p className="mt-1 text-muted-foreground">No hay viajes sospechosos pendientes de revisión.</p>
            </div>
        )}
    </div>
  )
}
