// src/app/admin/rides/page.tsx
'use client';
import { useFirestore, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { useCollection, WithId } from '@/firebase/firestore/use-collection';
import { Ride, AuditLogAction } from '@/lib/types';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { X, CheckSquare, Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function RideStatusBadge({ status }: { status: Ride['status'] }) {
    const variants: Record<string, string> = {
        searching_driver: 'bg-blue-500/20 text-blue-700',
        driver_assigned: 'bg-yellow-500/20 text-yellow-700',
        in_progress: 'bg-purple-500/20 text-purple-700',
        finished: 'bg-green-500/20 text-green-700',
        cancelled: 'bg-red-500/20 text-red-700',
    };
    return <Badge className={variants[status] || 'bg-gray-500/20 text-gray-700'}>{status}</Badge>;
}

const logAdminAction = (
    firestore: any,
    admin: any,
    action: AuditLogAction,
    entityId: string,
    details?: string
) => {
    if (!firestore || !admin) return;
    const auditLogsCollection = collection(firestore, 'auditLogs');
    const log = {
        adminId: admin.uid,
        adminName: admin.displayName || admin.email || 'Admin Anónimo',
        action: action,
        entityId: entityId,
        timestamp: serverTimestamp() as any,
        details: details || `Viaje ID: ${entityId}`,
    };
    addDocumentNonBlocking(auditLogsCollection, log);
};

export default function AdminRidesPage() {
    const firestore = useFirestore();
    const { user: adminUser } = useUser();
    const { toast } = useToast();
    const [updatingRides, setUpdatingRides] = useState<string[]>([]);
    
    const ridesQuery = query(collection(firestore, 'rides'), orderBy('createdAt', 'desc'));
    const { data: rides, isLoading } = useCollection<Ride>(ridesQuery);
    
    const handleRideAction = (rideId: string, action: 'cancel' | 'audit') => {
        if (!firestore || !adminUser) return;
        setUpdatingRides(prev => [...prev, rideId]);

        const rideRef = doc(firestore, 'rides', rideId);
        let updateData: Partial<Ride> = { updatedAt: serverTimestamp() as any };
        let logAction: AuditLogAction;
        let toastTitle: string;
        
        if(action === 'cancel') {
            updateData.status = 'cancelled';
            logAction = 'ride_cancelled_by_admin';
            toastTitle = 'Viaje Cancelado';
        } else {
            updateData.audited = true;
            logAction = 'ride_marked_as_audited';
            toastTitle = 'Viaje Marcado como Auditado';
        }
        
        updateDocumentNonBlocking(rideRef, updateData);
        logAdminAction(firestore, adminUser, logAction, rideId);
        
        toast({ title: toastTitle });
        setTimeout(() => setUpdatingRides(prev => prev.filter(id => id !== rideId)), 1000);
    }
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Viajes</CardTitle>
                    <CardDescription>Monitorizar, cancelar o auditar viajes en la plataforma.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Pasajero</TableHead>
                                <TableHead>Conductor</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead>Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && <TableRow><TableCell colSpan={6} className="text-center">Cargando viajes...</TableCell></TableRow>}
                            {rides?.map((ride) => (
                                <TableRow key={ride.id} className={ride.audited ? 'bg-green-500/5' : ''}>
                                    <TableCell>{format(ride.createdAt.toDate(), 'Ppp', { locale: es })}</TableCell>
                                    <TableCell>{ride.passengerName || 'N/A'}</TableCell>
                                    <TableCell>{ride.driverName || 'N/A'}</TableCell>
                                    <TableCell><RideStatusBadge status={ride.status} /></TableCell>
                                    <TableCell>{formatCurrency(ride.pricing.finalTotal || ride.pricing.estimatedTotal)}</TableCell>
                                    <TableCell className="flex gap-2">
                                        {updatingRides.includes(ride.id) ? <Loader2 className="animate-spin" /> : (
                                            <>
                                            {ride.status !== 'finished' && ride.status !== 'cancelled' && (
                                                <Button size="icon" variant="outline" className="text-red-600" onClick={() => handleRideAction(ride.id, 'cancel')}><X className="w-4 h-4" /></Button>
                                            )}
                                            {!ride.audited && (
                                                <Button size="icon" variant="outline" className="text-blue-600" onClick={() => handleRideAction(ride.id, 'audit')}><CheckSquare className="w-4 h-4" /></Button>
                                            )}
                                            <Button size="icon" variant="ghost"><Eye className="w-4 h-4" /></Button>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && rides?.length === 0 && <TableRow><TableCell colSpan={6} className="text-center">No hay viajes para mostrar.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
