// src/app/admin/drivers/page.tsx
'use client';
import { useFirestore, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import { useCollection, WithId } from '@/firebase/firestore/use-collection';
import { UserProfile, AuditLog, AuditLogAction } from '@/lib/types';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, X, Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

function DriverStatusBadge({ status }: { status?: UserProfile['driverStatus'] }) {
    const variants: Record<string, 'secondary' | 'destructive' | 'default'> = {
        inactive: 'secondary',
        online: 'default',
        in_ride: 'destructive'
    };
    return <Badge variant={variants[status || 'inactive'] || 'secondary'}>{status || 'N/A'}</Badge>;
}

function ApprovalStatusBadge({ approved }: { approved?: boolean }) {
    return approved ? (
        <Badge className="bg-green-500/20 text-green-700 hover:bg-green-500/30">Aprobado</Badge>
    ) : (
        <Badge variant="destructive">Pendiente</Badge>
    );
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
    const log: AuditLog = {
        adminId: admin.uid,
        adminName: admin.displayName || admin.email || 'Admin Anónimo',
        action: action,
        entityId: entityId,
        timestamp: serverTimestamp() as any,
        details: details || `Conductor ID: ${entityId}`,
    };
    addDocumentNonBlocking(auditLogsCollection, log);
};

export default function AdminDriversPage() {
    const firestore = useFirestore();
    const { user: adminUser } = useUser();
    const { toast } = useToast();
    const [updatingDrivers, setUpdatingDrivers] = useState<string[]>([]);
    
    const driversQuery = query(collection(firestore, 'users'), where('role', '==', 'driver'));
    const { data: drivers, isLoading } = useCollection<UserProfile>(driversQuery);

    const handleApproval = (driverId: string, approve: boolean) => {
        if (!firestore || !adminUser) return;
        setUpdatingDrivers(prev => [...prev, driverId]);

        const driverRef = doc(firestore, 'users', driverId);
        const action: AuditLogAction = approve ? 'driver_approved' : 'driver_rejected';
        
        updateDocumentNonBlocking(driverRef, { approved: approve, updatedAt: serverTimestamp() });
        logAdminAction(firestore, adminUser, action, driverId);

        toast({
            title: `Conductor ${approve ? 'Aprobado' : 'Rechazado'}`,
            description: `La operación se completó exitosamente.`,
        });
        setTimeout(() => setUpdatingDrivers(prev => prev.filter(id => id !== driverId)), 1000);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Conductores</CardTitle>
                    <CardDescription>Aprobar, rechazar o ver el estado de los conductores registrados.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Aprobado</TableHead>
                                <TableHead>Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center">Cargando conductores...</TableCell>
                                </TableRow>
                            )}
                            {drivers && drivers.map((driver) => (
                                <TableRow key={driver.id}>
                                    <TableCell>{driver.name}</TableCell>
                                    <TableCell>{driver.email || 'N/A'}</TableCell>
                                    <TableCell><DriverStatusBadge status={driver.driverStatus} /></TableCell>
                                    <TableCell><ApprovalStatusBadge approved={driver.approved} /></TableCell>
                                    <TableCell className="flex gap-2">
                                    {updatingDrivers.includes(driver.id) ? <Loader2 className="animate-spin" /> : (
                                        <>
                                        {!driver.approved && (
                                            <>
                                            <Button size="icon" variant="outline" className="text-green-600" onClick={() => handleApproval(driver.id, true)}><Check className="w-4 h-4" /></Button>
                                            <Button size="icon" variant="outline" className="text-red-600" onClick={() => handleApproval(driver.id, false)}><X className="w-4 h-4" /></Button>
                                            </>
                                        )}
                                        <Button size="icon" variant="ghost"><Eye className="w-4 h-4" /></Button>
                                        </>
                                    )}
                                    </TableCell>
                                </TableRow>
                            ))}
                             {!isLoading && drivers?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center">No hay conductores registrados.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
