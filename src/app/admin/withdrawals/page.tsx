
'use client';

import React, { useState } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore, useCollection, useUser, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { WithdrawalRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

function formatCurrency(value?: number) {
  if (typeof value !== 'number') return '$0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

function formatTimestamp(ts: any) {
  if (!ts) return 'N/A';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminWithdrawalsPage() {
  const firestore = useFirestore();
  const { profile: adminProfile, loading: authLoading } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  
  const [processingId, setProcessingId] = useState<string | null>(null);

  const requestsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || adminProfile?.role !== 'admin') return null;

    return query(
      collection(firestore, 'withdrawal_requests'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
  }, [firestore, adminProfile, authLoading]);

  const { data: requests, isLoading, error } = useCollection<WithdrawalRequest>(requestsQuery);
  
  const handleProcessRequest = async (requestId: string, action: 'approve' | 'reject') => {
    if (!firebaseApp) return;
    setProcessingId(requestId);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const processWithdrawal = httpsCallable(functions, 'processWithdrawalByAdminV1');
      await processWithdrawal({ requestId, action });
      toast({ title: 'Solicitud Procesada', description: `La solicitud ha sido marcada como ${action === 'approve' ? 'aprobada' : 'rechazada'}.` });
    } catch(e: any) {
      toast({ variant: 'destructive', title: 'Error al procesar', description: e.message });
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Solicitudes de Retiro</h1>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  
  if (error) {
    return <p className="text-destructive">Error: {error.message}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Solicitudes de Retiro</h1>
        <p className="text-sm text-muted-foreground">
          Aprobá o rechazá las solicitudes de retiro de los conductores. El saldo se descuenta de la app al aprobar.
        </p>
      </div>

      {requests && requests.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {requests.map(req => (
            <Card key={req.id} className={processingId === req.id ? 'animate-pulse' : ''}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{req.driverName}</span>
                  <Badge variant="secondary">{formatCurrency(req.amount)}</Badge>
                </CardTitle>
                <CardDescription>
                  Solicitado el: {formatTimestamp(req.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 bg-secondary/50 p-4 rounded-md text-sm">
                <p className="font-semibold">Datos para Transferencia:</p>
                <p><strong>Titular:</strong> {req.bankInfo.accountHolder}</p>
                <p><strong>CBU/Alias:</strong> {req.bankInfo.cbuOrAlias}</p>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 pt-4">
                <Button variant="destructive" onClick={() => handleProcessRequest(req.id, 'reject')} disabled={!!processingId}>Rechazar</Button>
                <Button onClick={() => handleProcessRequest(req.id, 'approve')} disabled={!!processingId}>Aprobar</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-center py-12">
            <VamoIcon name="check-circle" className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardHeader>
                <CardTitle>Todo al día</CardTitle>
                <CardDescription>No hay solicitudes de retiro pendientes.</CardDescription>
            </CardHeader>
        </Card>
      )}
    </div>
  );
}
