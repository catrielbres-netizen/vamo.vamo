// src/app/admin/audit-log/page.tsx
'use client';
import { useFirestore } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { AuditLog } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AdminAuditLogPage() {
    const firestore = useFirestore();
    const auditLogQuery = query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'));
    const { data: logs, isLoading } = useCollection<AuditLog>(auditLogQuery);

    const getActionText = (action: string) => {
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Registro de Auditoría</CardTitle>
                    <CardDescription>Registro de todas las acciones realizadas por los administradores.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Admin</TableHead>
                                <TableHead>Acción</TableHead>
                                <TableHead>Detalles</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && <TableRow><TableCell colSpan={4} className="text-center">Cargando registros...</TableCell></TableRow>}
                            {logs?.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>{format(log.timestamp.toDate(), 'Ppp', { locale: es })}</TableCell>
                                    <TableCell>{log.adminName}</TableCell>
                                    <TableCell>{getActionText(log.action)}</TableCell>
                                    <TableCell>{log.details || log.entityId}</TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && logs?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center">No hay registros de auditoría.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
