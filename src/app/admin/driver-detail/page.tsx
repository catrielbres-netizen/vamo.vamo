'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useDoc, useUser, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { VamoIcon, WhatsAppLogo } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type DriverProfile = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  approved?: boolean;
  isSuspended?: boolean;
  serviceTier?: 'express' | 'premium';
  servicesOffered?: {
    express?: boolean;
    premium?: boolean;
  };
  currentBalance?: number;
  vehicleVerificationStatus?: string;
  driverStatus?: string;
  photoURL?: string;
};

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
}

export default function AdminDriverDetailPage() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { profile: adminProfile, loading: authLoading } = useUser();
  const firebaseApp = useFirebaseApp();
  const router = useRouter();
  const { toast } = useToast();

  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [isSendingPush, setIsSendingPush] = useState(false);

  const driverId = useMemo(() => searchParams.get('id'), [searchParams]);

  const driverRef = useMemoFirebase(() => {
    if (authLoading || !firestore || adminProfile?.role !== 'admin' || !driverId) return null;
    return doc(firestore, 'users', driverId);
  }, [firestore, adminProfile, authLoading, driverId]);

  const { data: driver, isLoading, error } = useDoc<DriverProfile>(driverRef);

  const callCloudFunction = async (functionName: string, data: any, successMessage: string) => {
    if (!firebaseApp || !driverId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Contexto de la app o ID del conductor no encontrado.' });
      return;
    }
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const callable = httpsCallable(functions, functionName);
      await callable(data);
      toast({ title: 'Éxito', description: successMessage });
    } catch (e: any) {
      console.error(`Error llamando a ${functionName}:`, e);
      toast({ variant: 'destructive', title: `Error en ${functionName}`, description: e.message });
    }
  };

  const approveDriver = () => callCloudFunction('approveDriverByAdminV1', { driverId }, 'Conductor aprobado correctamente.');
  const rejectDriver = () => callCloudFunction('rejectDriverByAdminV1', { driverId }, 'El conductor ha sido marcado como rechazado.');

  const suspendDriver = async (suspend: boolean) => {
    const action = suspend ? 'suspender' : 'reactivar';
    const confirmed = window.confirm(`¿Seguro que querés ${action} esta cuenta?`);
    if (confirmed) {
      await callCloudFunction('suspendDriverByAdminV1', { driverId, suspend }, `Cuenta ${suspend ? 'suspendida' : 'reactivada'} correctamente.`);
    }
  };
  
  const sendPushNotification = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'Completá título y mensaje.',
      });
      return;
    }

    setIsSendingPush(true);
    await callCloudFunction(
      'sendDriverNotificationByAdminV1',
      { driverId, title: pushTitle, body: pushBody },
      'Notificación enviada correctamente.'
    );
    setIsSendingPush(false);
    setPushTitle('');
    setPushBody('');
  };

  const adjustBalance = async () => {
    const amount = parseFloat(balanceAmount);
    if (isNaN(amount) || amount === 0) {
      toast({ variant: 'destructive', title: 'Monto inválido', description: 'Ingresá un número distinto de cero.' });
      return;
    }
    if (!balanceReason.trim()) {
        toast({ variant: 'destructive', title: 'Motivo requerido', description: 'Por favor, especificá un motivo para el ajuste.' });
        return;
    }

    setIsAdjustingBalance(true);
    await callCloudFunction(
        'adjustDriverBalanceByAdminV1',
        { driverId, amount, reason: balanceReason }, 
        `Saldo ajustado en ${formatCurrency(amount)}.`
    );
    setIsAdjustingBalance(false);
    setBalanceAmount('');
    setBalanceReason('');
  };

  const openWhatsApp = () => {
    if (!driver?.phone) {
        toast({
        variant: 'destructive',
        title: 'Sin teléfono',
        description: 'Este conductor no tiene un número de teléfono registrado.',
        });
        return;
    }

    const cleanPhone = driver.phone.replace(/\D/g, '');
    const message = encodeURIComponent(
        `Hola ${driver.name || ''}, te escribimos desde administración de VamO.`
    );

    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const setService = async (tier: 'express' | 'premium', services: { express: boolean, premium: boolean }) => {
    if (!driverRef) return;
    await updateDoc(driverRef, { serviceTier: tier, servicesOffered: services });
    toast({ title: 'Servicio Actualizado' });
  };
  
  const deleteDriver = async () => {
    const confirmed = window.confirm('¿ELIMINAR CONDUCTOR? Esta acción es irreversible y borrará todos sus datos.');
    if (confirmed) {
      await callCloudFunction('deleteDriverByAdminV1', { driverId }, 'Conductor eliminado correctamente.');
      router.push('/admin/drivers');
    }
  }

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  if (!driverId) {
    return <div className="p-6 text-destructive">Error: Falta el ID del conductor en la URL.</div>;
  }
  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }
  if (error) {
    return <div className="p-6 text-destructive">Error cargando perfil: {error.message}</div>;
  }
  if (!driver) {
    return <div className="p-6 text-destructive">No se encontró un conductor con el ID proporcionado.</div>;
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
                <AvatarImage src={driver.photoURL || undefined} alt={driver.name || ''} />
                <AvatarFallback className="text-3xl">{driver.name ? driver.name.charAt(0).toUpperCase() : 'S'}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-bold">{driver.name || 'Sin nombre'}</h1>
                <p className="text-sm text-muted-foreground">ID: {driver.id}</p>
            </div>
        </div>

      <Card>
        <CardHeader>
            <CardTitle>Información y Estado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Estado de Aprobación</span>
                <Badge variant={driver.approved ? 'default' : 'secondary'}>{driver.approved ? 'Aprobado' : 'Pendiente/Rechazado'}</Badge>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Estado de Cuenta</span>
                <Badge variant={driver.isSuspended ? 'destructive' : 'default'}>{driver.isSuspended ? 'Suspendida' : 'Activa'}</Badge>
            </div>
            <Separator className="!my-4"/>
            <p><strong>Email:</strong> {driver.email || '-'}</p>
            <p><strong>Teléfono:</strong> {driver.phone || '-'}</p>
            <p><strong>Saldo Actual:</strong> <span className={cn(driver.currentBalance && driver.currentBalance < 0 ? 'text-destructive' : 'text-primary', "font-bold")}>{formatCurrency(driver.currentBalance || 0)}</span></p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
            <CardHeader><CardTitle>Acciones de Cuenta</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
                <Button onClick={approveDriver} disabled={driver.approved}>Aprobar Conductor</Button>
                <Button onClick={rejectDriver} variant="secondary" disabled={!driver.approved}>Marcar como Rechazado</Button>
                <Separator className="!my-2" />
                {driver.isSuspended ? (
                    <Button variant="outline" onClick={() => suspendDriver(false)}>Reactivar Cuenta</Button>
                ) : (
                    <Button variant="destructive" onClick={() => suspendDriver(true)}>Suspender Cuenta</Button>
                )}
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle>Gestión de Saldo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1">
                    <Label htmlFor="balance-amount">Monto (usar "-" para debitar)</Label>
                    <Input id="balance-amount" type="number" placeholder="-500" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} disabled={isAdjustingBalance}/>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="balance-reason">Motivo</Label>
                    <Input id="balance-reason" type="text" placeholder="Ej: Multa por cancelación" value={balanceReason} onChange={(e) => setBalanceReason(e.target.value)} disabled={isAdjustingBalance}/>
                </div>
                <Button onClick={adjustBalance} disabled={isAdjustingBalance} className="w-full">
                    {isAdjustingBalance ? 'Ajustando...' : 'Ajustar Saldo'}
                </Button>
            </CardContent>
        </Card>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
            <CardHeader><CardTitle>Configurar Servicios</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
                <Button onClick={() => setService('express', { express: true, premium: false })}>Solo Express</Button>
                <Button onClick={() => setService('premium', { premium: true, express: false })} variant="secondary">Solo Premium</Button>
                <Button onClick={() => setService('premium', { premium: true, express: true })} variant="outline">Premium + Express</Button>
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle>Notificación Push</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1">
                <Label htmlFor="push-title">Título</Label>
                <Input
                    id="push-title"
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    placeholder="Ej: Cuenta aprobada"
                />
                </div>
                <div className="space-y-1">
                <Label htmlFor="push-body">Mensaje</Label>
                <Input
                    id="push-body"
                    value={pushBody}
                    onChange={(e) => setPushBody(e.target.value)}
                    placeholder="Ej: Ya podés operar en VamO"
                />
                </div>
                <Button onClick={sendPushNotification} disabled={isSendingPush} className="w-full">
                {isSendingPush ? 'Enviando...' : 'Enviar Notificación'}
                </Button>
            </CardContent>
        </Card>
      </div>

       <div className="grid md:grid-cols-2 gap-6">
         <Card>
            <CardHeader><CardTitle>Contacto</CardTitle></CardHeader>
            <CardContent>
                <Button onClick={openWhatsApp} className="w-full">
                    <WhatsAppLogo className="mr-2 h-5 w-5" /> Abrir Chat en WhatsApp
                </Button>
            </CardContent>
        </Card>
        <Card className="border-destructive">
            <CardHeader>
                <CardTitle className="text-destructive">Zona de Peligro</CardTitle>
                <CardDescription>Estas acciones son irreversibles.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button variant="destructive" onClick={deleteDriver} className="w-full">
                    <VamoIcon name="alert-triangle" className="mr-2" /> Eliminar Conductor Permanentemente
                </Button>
            </CardContent>
        </Card>
       </div>
    </div>
  );
}
