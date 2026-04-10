'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
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
import { Loader2, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { updateDoc } from 'firebase/firestore';

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
  vehicleFrontPhotoURL?: string;
  driverSubtype?: string;
  requiresManualReview?: boolean;
  manualReviewStatus?: 'none' | 'pending_docs' | 'docs_submitted' | 'approved' | 'rejected';
  documentsRequested?: string[];
  documentsSubmitted?: Record<string, { url: string; uploadedAt: any }>;
  adminReviewNote?: string;
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

  // Manual Review State
  const [reviewNote, setReviewNote] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  const DOC_OPTIONS = [
    { id: 'dni', label: 'DNI (Frente y Dorso)' },
    { id: 'licencia', label: 'Licencia de Conducir' },
    { id: 'cedula', label: 'Cédula del Vehículo' },
    { id: 'habilitacion', label: 'Habilitación Taxi/Remis' },
    { id: 'seguro', label: 'Póliza de Seguro' },
    { id: 'antecedentes', label: 'Certificado Antecedentes' },
  ];

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
      const functions = getFunctions(undefined, 'us-central1');
      const callable = httpsCallable(functions, functionName);
      await callable(data);
      toast({ title: 'Éxito', description: successMessage });
    } catch (e: any) {
      console.error(`Error llamando a ${functionName}:`, e);
      toast({ variant: 'destructive', title: `Error en ${functionName}`, description: e.message });
    }
  };
  
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);

  const approveDriver = async () => {
    setIsApproving(true);
    await callCloudFunction('approveDriverByAdminV1', { driverId }, 'Conductor aprobado correctamente.');
    setIsApproving(false);
  };
  const rejectDriver = async () => {
    const reason = window.prompt("Motivo del rechazo (opcional):");
    setIsRejecting(true);
    await callCloudFunction('rejectDriverByAdminV1', { driverId, reason }, 'El conductor ha sido marcado como rechazado.');
    setIsRejecting(false);
  };

  const suspendDriver = async (suspend: boolean) => {
    const action = suspend ? 'suspender' : 'reactivar';
    const confirmed = window.confirm(`¿Seguro que querés ${action} esta cuenta?`);
    if (confirmed) {
      setIsSuspending(true);
      await callCloudFunction('suspendDriverByAdminV1', { driverId, suspend }, `Cuenta ${suspend ? 'suspendida' : 'reactivada'} correctamente.`);
      setIsSuspending(false);
    }
  };
  
  const sendPushNotification = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Completá título y mensaje.' });
      return;
    }
    setIsSendingPush(true);
    await callCloudFunction('sendDriverNotificationByAdminV1', { driverId, title: pushTitle, body: pushBody }, 'Notificación enviada correctamente.');
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
    await callCloudFunction('adjustDriverBalanceByAdminV1', { driverId, amount, reason: balanceReason }, `Saldo ajustado en ${formatCurrency(amount)}.`);
    setIsAdjustingBalance(false);
    setBalanceAmount('');
    setBalanceReason('');
  };

  const openWhatsApp = () => {
    if (!driver?.phone) {
        toast({ variant: 'destructive', title: 'Sin teléfono', description: 'Este conductor no tiene un número de teléfono registrado.' });
        return;
    }
    const cleanPhone = driver.phone.replace(/\D/g, '');
    const message = encodeURIComponent(`Hola ${driver.name || ''}, te escribimos desde administración de VamO.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const setService = async (tier: 'express' | 'premium', services: { express: boolean, premium: boolean }) => {
    await callCloudFunction('updateDriverServiceByAdminV1', { driverId, serviceTier: tier, servicesOffered: services }, 'Servicio actualizado correctamente.');
  };
  
  const deleteDriver = async () => {
    const confirmed = window.confirm('¿ELIMINAR CONDUCTOR? Esta acción es irreversible y borrará todos sus datos.');
    if (confirmed) {
      await callCloudFunction('deleteDriverByAdminV1', { driverId }, 'Conductor eliminado correctamente.');
      router.push('/admin/drivers');
    }
  }

  const handleRequestDocs = async () => {
    if (!firestore || !driverId) return;
    setIsUpdatingReview(true);
    try {
        const userRef = doc(firestore, 'users', driverId);
        await updateDoc(userRef, {
            requiresManualReview: true,
            manualReviewStatus: 'pending_docs',
            documentsRequested: selectedDocs,
            adminReviewNote: reviewNote,
        });
        toast({ title: 'Solicitud enviada', description: 'El conductor verá el pedido en su perfil.' });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
        setIsUpdatingReview(false);
    }
  };

  const toggleManualReview = async (enabled: boolean) => {
    if (!firestore || !driverId) return;
    try {
        const userRef = doc(firestore, 'users', driverId);
        await updateDoc(userRef, { requiresManualReview: enabled });
        toast({ title: 'Estado actualizado', description: `Revisión manual ${enabled ? 'activada' : 'desactivada'}.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const updateManualReviewStatus = async (status: 'approved' | 'rejected') => {
    if (!firestore || !driverId) return;
    setIsUpdatingReview(true);
    try {
        const userRef = doc(firestore, 'users', driverId);
        await updateDoc(userRef, { manualReviewStatus: status });
        toast({ title: 'Estado de revisión actualizado', description: `El conductor ha sido ${status === 'approved' ? 'aprobado' : 'rechazado'} manualment.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
        setIsUpdatingReview(false);
    }
  };

  if (authLoading || isLoading) {
    return <div className="p-6 space-y-6 max-w-5xl mx-auto"><Skeleton className="h-64 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  }
  if (!driverId || !driver) {
    return <div className="p-6 text-destructive text-center max-w-5xl mx-auto">Error: No se encontró el conductor.</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-6 pb-20">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
            <Avatar className="h-24 w-24 border-2 border-zinc-800 shadow-2xl">
                <AvatarImage src={driver.photoURL || undefined} alt={driver.name || ''} />
                <AvatarFallback className="text-4xl font-black bg-zinc-900">{driver.name ? driver.name.charAt(0).toUpperCase() : '?'}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left flex-1">
                <h1 className="text-4xl font-black tracking-tight">{driver.name || 'Sin nombre'}</h1>
                <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-1">UID: {driver.id}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-xl border-zinc-800 bg-zinc-900/50" onClick={openWhatsApp}>
                    <WhatsAppLogo className="mr-2 h-4 w-4" /> WhatsApp
                </Button>
            </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* STATS & INFO */}
        <div className="lg:col-span-1 space-y-6">
            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado de Cuenta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                        <span className="text-sm font-medium">Aprobación</span>
                        <Badge variant={driver.approved ? 'default' : 'secondary'} className={cn(driver.approved ? "bg-green-500/10 text-green-500 border-green-500/20" : "")}>
                            {driver.approved ? 'Aprobado' : 'Pendiente'}
                        </Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                        <span className="text-sm font-medium">Estado</span>
                        <Badge variant={driver.isSuspended ? 'destructive' : 'default'} className={cn(!driver.isSuspended ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "")}>
                            {driver.isSuspended ? 'Suspendida' : 'Activa'}
                        </Badge>
                    </div>
                    <div className="pt-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Saldo Actual</p>
                        <p className={cn("text-3xl font-black tracking-tighter", (driver.currentBalance || 0) < 0 ? "text-red-500" : "text-white")}>
                            {formatCurrency(driver.currentBalance || 0)}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Datos de Contacto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div>
                        <Label className="text-[10px] text-zinc-500 uppercase">Email</Label>
                        <p className="font-medium text-white break-all">{driver.email || 'N/A'}</p>
                    </div>
                    <div>
                        <Label className="text-[10px] text-zinc-500 uppercase">Número de Licencia</Label>
                        <p className="font-bold text-white tracking-widest">{(driver as any).licenseNumber || 'PENDIENTE'}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Verificación de Vehículo</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    {driver.vehicleFrontPhotoURL ? (
                        <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black aspect-video relative group">
                            <img 
                                src={driver.vehicleFrontPhotoURL} 
                                alt="Foto del vehículo" 
                                className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="secondary" size="sm" onClick={() => window.open(driver.vehicleFrontPhotoURL, '_blank')} className="rounded-full font-bold">
                                    <VamoIcon name="external-link" className="mr-2 h-4 w-4" /> Ver Grande
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border-2 border-dashed border-zinc-800 p-8 text-center bg-zinc-900/20">
                            <VamoIcon name="camera-off" className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-xs text-zinc-500 font-bold uppercase">Sin foto cargada</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        {/* ACTIONS */}
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ACCOUNT MANAGEMENT */}
                <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
                    <CardHeader><CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Gestión de Cuenta</CardTitle></CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {!driver.approved ? (
                            <Button onClick={approveDriver} disabled={isApproving} className="bg-green-600 hover:bg-green-700 text-white font-black rounded-xl h-12 shadow-lg shadow-green-900/20">
                                {isApproving ? <Loader2 className="animate-spin h-4 w-4" /> : 'APROBAR CONDUCTOR'}
                            </Button>
                        ) : (
                            <Button onClick={rejectDriver} disabled={isRejecting} variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 font-black rounded-xl h-12">
                                {isRejecting ? <Loader2 className="animate-spin h-4 w-4" /> : 'REVERTIR APROBACIÓN'}
                            </Button>
                        )}
                        <Button 
                            onClick={() => suspendDriver(!driver.isSuspended)} 
                            disabled={isSuspending}
                            variant={driver.isSuspended ? 'default' : 'destructive'} 
                            className="font-black rounded-xl h-12"
                        >
                            {isSuspending ? <Loader2 className="animate-spin h-4 w-4" /> : (driver.isSuspended ? 'REACTIVAR CUENTA' : 'SUSPENDER CUENTA')}
                        </Button>
                    </CardContent>
                </Card>

                {/* SERVICE CONFIG */}
                <Card className="border-zinc-800 bg-zinc-900/20">
                    <CardHeader><CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Configuración de Servicio</CardTitle></CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <Button variant={driver.serviceTier==='express'?'default':'outline'} onClick={() => setService('express', { express: true, premium: false })} className="justify-start gap-2 h-10 rounded-xl">
                            <VamoIcon name="navigation" className="h-4 w-4" /> Solo Express
                        </Button>
                        <Button variant={driver.serviceTier==='premium'?'default':'outline'} onClick={() => setService('premium', { premium: true, express: false })} className="justify-start gap-2 h-10 rounded-xl">
                            <VamoIcon name="star" className="h-4 w-4" /> Solo Premium
                        </Button>
                        <Button variant={driver.servicesOffered?.express && driver.servicesOffered?.premium ? 'default' : 'outline'} onClick={() => setService('premium', { premium: true, express: true })} className="justify-start gap-2 h-10 rounded-xl">
                            <VamoIcon name="zap" className="h-4 w-4" /> Premium + Express
                        </Button>
                    </CardContent>
                </Card>

                {/* NOTIFICATIONS */}
                <Card className="border-zinc-800 bg-zinc-900/20">
                    <CardHeader><CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notificar Conductor</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <Input placeholder="Título" value={pushTitle} onChange={e => setPushTitle(e.target.value)} className="bg-black/40 border-zinc-800" />
                        <Input placeholder="Mensaje" value={pushBody} onChange={e => setPushBody(e.target.value)} className="bg-black/40 border-zinc-800" />
                        <Button onClick={sendPushNotification} disabled={isSendingPush} className="w-full bg-primary text-white font-bold h-12 rounded-xl">
                            {isSendingPush ? <Loader2 className="animate-spin h-4 w-4" /> : 'Enviar Notificación'}
                        </Button>
                    </CardContent>
                </Card>

                {/* BALANCE ADJUSTMENT */}
                <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ajuste Manual de Saldo</CardTitle>
                        <CardDescription className="text-[10px]">Monto negativo para débitos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-1">
                            <Input type="number" placeholder="Monto (Ej: 1000 o -500)" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} className="bg-black/40 border-zinc-800" />
                        </div>
                        <div className="space-y-1">
                            <Input type="text" placeholder="Motivo del ajuste" value={balanceReason} onChange={e => setBalanceReason(e.target.value)} className="bg-black/40 border-zinc-800" />
                        </div>
                        <Button onClick={adjustBalance} disabled={isAdjustingBalance} className="w-full h-12 rounded-xl bg-white text-black font-black hover:bg-zinc-200">
                            {isAdjustingBalance ? <Loader2 className="animate-spin h-4 w-4" /> : 'Confirmar Ajuste'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* MANUAL VERIFICATION & DOCUMENTATION */}
            <Card className="border-indigo-500/30 bg-indigo-500/5 backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Verificación de Documentación Manual</CardTitle>
                        <CardDescription className="text-[10px]">Especial para conductores de Taxi y Remis.</CardDescription>
                    </div>
                    <Switch 
                        checked={driver.requiresManualReview} 
                        onCheckedChange={toggleManualReview}
                    />
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    {/* ESTADO ACTUAL */}
                    <div className="flex items-center gap-4 p-3 bg-black/40 rounded-xl border border-indigo-500/10">
                        <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center",
                            driver.manualReviewStatus === 'approved' ? "bg-green-500/20 text-green-500" :
                            driver.manualReviewStatus === 'rejected' ? "bg-red-500/20 text-red-500" :
                            driver.manualReviewStatus === 'docs_submitted' ? "bg-blue-500/20 text-blue-500" :
                            "bg-zinc-500/20 text-zinc-500"
                        )}>
                            {driver.manualReviewStatus === 'approved' ? <CheckCircle2 className="h-5 w-5" /> :
                             driver.manualReviewStatus === 'rejected' ? <AlertCircle className="h-5 w-5" /> :
                             driver.manualReviewStatus === 'docs_submitted' ? <Clock className="h-5 w-5" /> :
                             <FileText className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado de Revisión</p>
                            <p className="text-sm font-bold uppercase tracking-tight">
                                {driver.manualReviewStatus === 'approved' ? 'Aprobado Manualmente' :
                                 driver.manualReviewStatus === 'rejected' ? 'Rechazado' :
                                 driver.manualReviewStatus === 'docs_submitted' ? 'Documentos Enviados (REVISAR)' :
                                 driver.manualReviewStatus === 'pending_docs' ? 'Esperando Documentos' :
                                 'Sin Iniciar'}
                            </p>
                        </div>
                        {driver.requiresManualReview && (
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="border-green-500 text-green-500 hover:bg-green-500/10 h-8" onClick={() => updateManualReviewStatus('approved')} disabled={isUpdatingReview}>
                                    Aprobar
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-500 text-red-500 hover:bg-red-500/10 h-8" onClick={() => updateManualReviewStatus('rejected')} disabled={isUpdatingReview}>
                                    Rechazar
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* SOLICITUD DE DOCUMENTOS */}
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Solicitar Documentos Específicos</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {DOC_OPTIONS.map((opt) => (
                                <div key={opt.id} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <Checkbox 
                                        id={opt.id} 
                                        checked={selectedDocs.includes(opt.id) || driver.documentsRequested?.includes(opt.id)}
                                        onCheckedChange={(checked) => {
                                            if (checked) setSelectedDocs(prev => [...prev, opt.id]);
                                            else setSelectedDocs(prev => prev.filter(x => x !== opt.id));
                                        }}
                                    />
                                    <label htmlFor={opt.id} className="text-xs font-medium cursor-pointer">{opt.label}</label>
                                </div>
                            ))}
                        </div>
                        
                        <div className="space-y-2">
                             <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Nota para el Conductor</Label>
                             <Input 
                                placeholder="Ej: Las fotos del carnet están borrosas..." 
                                value={reviewNote || driver.adminReviewNote || ''} 
                                onChange={e => setReviewNote(e.target.value)}
                                className="bg-black/40 border-zinc-800 text-xs"
                             />
                        </div>

                        <Button 
                            onClick={handleRequestDocs} 
                            disabled={isUpdatingReview}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl h-10 text-[10px] uppercase tracking-widest"
                        >
                            {isUpdatingReview ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                            Actualizar Solicitud de Docs
                        </Button>
                    </div>

                    {/* VISUALIZADOR DE DOCUMENTOS SUBIDOS */}
                    {(driver.documentsSubmitted && Object.keys(driver.documentsSubmitted).length > 0) && (
                        <div className="space-y-3 pt-2 border-t border-indigo-500/10">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Documentación Presentada</Label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {Object.entries(driver.documentsSubmitted).map(([key, data]) => (
                                    <div key={key} className="group relative rounded-lg overflow-hidden aspect-square border border-zinc-800 bg-black">
                                        <img src={data.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80">
                                            <p className="text-[8px] font-black uppercase truncate text-indigo-400">{DOC_OPTIONS.find(o => o.id === key)?.label || key}</p>
                                        </div>
                                        <button 
                                            onClick={() => window.open(data.url, '_blank')}
                                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <VamoIcon name="external-link" className="h-5 w-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DANGER ZONE */}
            <div className="p-6 border border-red-950/30 bg-red-950/10 rounded-2xl">
                <h3 className="text-red-500 font-bold mb-1 flex items-center gap-2 uppercase tracking-widest text-xs">
                    <VamoIcon name="alert-triangle" className="h-4 w-4" /> Zona de Peligro
                </h3>
                <p className="text-[10px] text-red-500/60 mb-4 font-medium italic">Acción irreversible. Borra al conductor por completo del sistema.</p>
                <Button variant="destructive" onClick={deleteDriver} className="rounded-xl font-black tracking-widest text-[10px] uppercase h-10 w-full md:w-auto">
                    Borrar Conductor
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
