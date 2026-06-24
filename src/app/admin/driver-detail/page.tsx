'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useFirestore, useDoc, useUser, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { RideReceipt } from '@/components/RideReceipt';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

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
import { syncPublicDriverProfile } from '@/lib/driver-public';

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
  municipalStatus?: string;
  requiresManualReview?: boolean;
  manualReviewStatus?: 'none' | 'pending_docs' | 'docs_submitted' | 'approved' | 'rejected';
  documentsRequested?: string[];
  documentsSubmitted?: Record<string, { url: string; uploadedAt: any }>;
  adminReviewNote?: string;
  driverRiskScore?: number;
  driverRiskLevel?: 'low' | 'medium' | 'high' | 'blocked';
  riskReasons?: string[];
  docsStatus?: string;
  licenseExpiry?: any;
  insuranceExpiry?: any;
  criminalRecordExpiry?: any;
  criminalRecordStatus?: string;
  documents?: Record<string, string>;
  legal?: {
    driverTermsAccepted?: boolean;
    driverTermsVersion?: string;
    driverTermsAcceptedAt?: any;
  };
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

  const [isMandatoryDoc, setIsMandatoryDoc] = useState(true);

  const DOC_OPTIONS = [
    { id: 'dni_front', label: 'DNI (Frente)' },
    { id: 'dni_back', label: 'DNI (Dorso)' },
    { id: 'license', label: 'Licencia de Conducir' },
    { id: 'insurance', label: 'Póliza de Seguro' },
    { id: 'vehicle_front', label: 'Foto Frente Vehículo' },
    { id: 'vehicle_back', label: 'Foto Trasera Vehículo' },
    { id: 'vehicle_interior', label: 'Foto Interior Vehículo' },
    { id: 'cedula', label: 'Cédula del Vehículo' },
    { id: 'technical_inspection', label: 'Verificación Técnica / RTO' },
    { id: 'other', label: 'Otro Documento' },
  ];

  const driverId = useMemo(() => searchParams.get('id'), [searchParams]);

  const driverRef = useMemoFirebase(() => {
    if (authLoading || !firestore || adminProfile?.role !== 'admin' || !driverId) return null;
    return doc(firestore, 'users', driverId);
  }, [firestore, adminProfile, authLoading, driverId]);

  const { data: driver, isLoading, error } = useDoc<DriverProfile>(driverRef);

  const [legalDoc, setLegalDoc] = useState<any>(null);
  const [loadingLegal, setLoadingLegal] = useState(false);

  const [docRequests, setDocRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!firestore || !driverId) return;
    const q = query(
        collection(firestore, `users/${driverId}/document_requests`),
        orderBy('requestedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDocRequests(requests);
    });
    return () => unsubscribe();
  }, [firestore, driverId]);

  useEffect(() => {
    if (!firestore || !driverId || !driver?.legal?.driverTermsAccepted || !driver?.legal?.driverTermsVersion) return;
    
    setLoadingLegal(true);
    const fetchLegal = async () => {
        try {
            const { getDoc, doc } = await import('firebase/firestore');
            const docId = `${driverId}_driver_terms_${driver.legal?.driverTermsVersion}`;
            const ref = doc(firestore, 'legal_acceptances', docId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                setLegalDoc(snap.data());
            }
        } catch (e) {
            console.error("Error fetching legal contract:", e);
        } finally {
            setLoadingLegal(false);
        }
    };
    fetchLegal();
  }, [firestore, driverId, driver?.legal?.driverTermsAccepted, driver?.legal?.driverTermsVersion]);

  const callCloudFunction = async (functionName: string, data: any, successMessage: string) => {
    if (!firebaseApp || !driverId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Contexto de la app o ID del conductor no encontrado.' });
      return;
    }
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const callable = httpsCallable(functions, functionName);
      await callable(data);
      if (firestore && driverId) {
          syncPublicDriverProfile(firestore, driverId).catch(console.error);
      }
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
    if (!firestore || !driverId || selectedDocs.length === 0) return;
    setIsUpdatingReview(true);
    try {
        for (const docType of selectedDocs) {
            await callCloudFunction('adminCreateDocumentRequestV1', { 
                driverId, 
                docType, 
                isMandatory: isMandatoryDoc, 
                adminNote: reviewNote 
            }, `Solicitud de ${docType} creada.`);
        }
        setSelectedDocs([]);
        setReviewNote('');
        toast({ title: 'Solicitudes enviadas', description: 'El conductor verá el pedido en su perfil.' });
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
        syncPublicDriverProfile(firestore, driverId).catch(console.error);
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
                <div className="flex gap-2 mt-2 justify-center md:justify-start">
                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-indigo-500/30 text-indigo-400 bg-indigo-500/5">
                        {driver.driverSubtype === 'express' ? 'PARTICULAR' : driver.driverSubtype === 'professional' ? 'TAXI / REMIS' : 'SIN SUBTIPO'}
                    </Badge>
                </div>
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

                    {/* FRAUD & RISK INDICATORS QUICK VIEW */}
                    <div className="pt-4 space-y-3 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center">
                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Score de Riesgo</p>
                            <span className={cn("text-xs font-black", 
                                (driver.driverRiskScore || 0) > 85 ? "text-red-500" :
                                (driver.driverRiskScore || 0) > 60 ? "text-orange-500" :
                                (driver.driverRiskScore || 0) > 30 ? "text-amber-500" : "text-green-500"
                            )}>
                                {driver.driverRiskScore || 0}/100
                            </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            {driver.driverRiskLevel && (
                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-widest",
                                    driver.driverRiskLevel === 'blocked' ? "border-red-500/50 text-red-500 bg-red-500/10" :
                                    driver.driverRiskLevel === 'high' ? "border-orange-500/50 text-orange-500 bg-orange-500/10" :
                                    driver.driverRiskLevel === 'medium' ? "border-amber-500/50 text-amber-500 bg-amber-500/10" :
                                    "border-green-500/50 text-green-500 bg-green-500/10"
                                )}>
                                    Nivel: {driver.driverRiskLevel}
                                </Badge>
                            )}
                            {(driver as any).plateNumber ? (
                                <Badge variant="outline" className="text-[9px] border-zinc-800 bg-zinc-900/50 font-black text-zinc-400">
                                    PATENTE: {(driver as any).plateNumber}
                                </Badge>
                            ) : null}
                            {(driver.currentBalance ?? 0) < -3000 ? (
                                <Badge variant="outline" className="text-[9px] border-red-500/20 bg-red-500/10 font-black text-red-500 uppercase">
                                    Deuda Alta
                                </Badge>
                            ) : null}
                            {driver.riskReasons && driver.riskReasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-[9px] border-zinc-700 bg-zinc-800/40 font-bold text-zinc-300">
                                    {reason}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Datos y Estado Municipal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-[10px] text-zinc-500 uppercase">Email</Label>
                        <p className="font-medium text-white break-all text-sm">{driver.email || 'N/A'}</p>
                    </div>
                    <Separator className="bg-zinc-800/50" />
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-zinc-500 uppercase">Estatus Municipal</Label>
                        <Badge variant="outline" className={cn("text-[10px] font-black uppercase", 
                            driver.municipalStatus === 'active' || driver.municipalStatus === 'municipal_approved' ? "border-green-500/30 text-green-500 bg-green-500/5" : "border-amber-500/30 text-amber-500 bg-amber-500/5")}>
                            {driver.municipalStatus || 'PENDIENTE'}
                        </Badge>
                    </div>
                    <Button 
                        variant="link" 
                        className="text-[10px] p-0 h-auto text-indigo-400 font-black uppercase tracking-widest"
                        onClick={() => router.push(`/traffic/drivers/${driverId}`)}
                    >
                        Ver Legajo Municipal Completo →
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado Documental</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-800/50">
                            <span className="text-xs font-bold text-zinc-300">DNI Frente/Dorso</span>
                            <Badge variant="outline" className={driver.documents?.dniFront ? "border-green-500/30 text-green-500 bg-green-500/5 text-[9px]" : "border-zinc-500/30 text-zinc-500 bg-zinc-500/5 text-[9px]"}>
                                {driver.documents?.dniFront ? 'CARGADO' : 'FALTANTE'}
                            </Badge>
                        </div>
                        <div className="flex flex-col pb-2 border-b border-zinc-800/50 gap-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-zinc-300">Licencia</span>
                                <Badge variant="outline" className={!driver.documents?.license ? "border-red-500/30 text-red-500 bg-red-500/5 text-[9px]" : (driver.licenseExpiry && driver.licenseExpiry.toMillis() < Date.now()) ? "border-red-500/30 text-red-500 bg-red-500/5 text-[9px]" : "border-green-500/30 text-green-500 bg-green-500/5 text-[9px]"}>
                                    {!driver.documents?.license ? 'FALTANTE' : (driver.licenseExpiry && driver.licenseExpiry.toMillis() < Date.now()) ? 'VENCIDA' : 'VIGENTE'}
                                </Badge>
                            </div>
                            {driver.licenseExpiry && (
                                <span className="text-[10px] font-medium text-zinc-500">Vence: {new Date(driver.licenseExpiry.toMillis()).toLocaleDateString('es-AR')}</span>
                            )}
                        </div>
                        <div className="flex flex-col pb-2 border-b border-zinc-800/50 gap-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-zinc-300">Seguro</span>
                                <Badge variant="outline" className={!driver.documents?.insurance ? "border-red-500/30 text-red-500 bg-red-500/5 text-[9px]" : (driver.insuranceExpiry && driver.insuranceExpiry.toMillis() < Date.now()) ? "border-red-500/30 text-red-500 bg-red-500/5 text-[9px]" : "border-green-500/30 text-green-500 bg-green-500/5 text-[9px]"}>
                                    {!driver.documents?.insurance ? 'FALTANTE' : (driver.insuranceExpiry && driver.insuranceExpiry.toMillis() < Date.now()) ? 'VENCIDO' : 'VIGENTE'}
                                </Badge>
                            </div>
                            {driver.insuranceExpiry && (
                                <span className="text-[10px] font-medium text-zinc-500">Vence: {new Date(driver.insuranceExpiry.toMillis()).toLocaleDateString('es-AR')}</span>
                            )}
                        </div>
                        <div className="flex flex-col pb-2 border-zinc-800/50 gap-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-zinc-300">Antecedentes Penales</span>
                                <Badge variant="outline" className={!driver.documents?.criminalRecord ? "border-amber-500/30 text-amber-500 bg-amber-500/5 text-[9px]" : (driver.criminalRecordExpiry && driver.criminalRecordExpiry.toMillis() < Date.now()) ? "border-orange-500/30 text-orange-500 bg-orange-500/5 text-[9px]" : "border-green-500/30 text-green-500 bg-green-500/5 text-[9px]"}>
                                    {!driver.documents?.criminalRecord ? 'FALTANTE' : (driver.criminalRecordExpiry && driver.criminalRecordExpiry.toMillis() < Date.now()) ? 'VENCIDO (NO BLOQUEA)' : 'VIGENTE'}
                                </Badge>
                            </div>
                            {driver.criminalRecordExpiry && (
                                <span className="text-[10px] font-medium text-zinc-500">Vence: {new Date(driver.criminalRecordExpiry.toMillis()).toLocaleDateString('es-AR')}</span>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-indigo-500/20 bg-indigo-500/5 backdrop-blur-xl">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Contrato Legal del Conductor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {driver.legal?.driverTermsAccepted ? (
                        <>
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-xs font-bold text-zinc-300">Estado Legal</span>
                                <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/5 text-[9px]">ACEPTADO</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-zinc-500 block text-[9px] uppercase font-bold">Versión</span>{driver.legal.driverTermsVersion}</div>
                                <div><span className="text-zinc-500 block text-[9px] uppercase font-bold">Fecha</span>{driver.legal.driverTermsAcceptedAt ? new Date(driver.legal.driverTermsAcceptedAt.toMillis()).toLocaleString('es-AR') : 'N/A'}</div>
                            </div>
                            
                            {loadingLegal ? (
                                <p className="text-xs text-zinc-500 animate-pulse">Cargando firma digital...</p>
                            ) : legalDoc ? (
                                <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/5 space-y-2 text-[10px]">
                                    <p className="font-bold text-green-400 uppercase flex items-center gap-1 mb-2">
                                        <CheckCircle2 className="h-3 w-3" /> Contrato aceptado y registrado con trazabilidad legal.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><span className="text-zinc-500 font-bold uppercase block">Firma (Aclaración)</span><span className="text-zinc-300 font-medium">{legalDoc.fullName}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">DNI</span><span className="text-zinc-300 font-medium">{legalDoc.dni}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">Ciudad Operativa</span><span className="text-zinc-300 font-medium">{legalDoc.cityKey}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">Email Asociado</span><span className="text-zinc-300 font-medium">{legalDoc.email}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">Hash (SHA-256)</span><span className="text-zinc-300 font-mono text-[8px] break-all">{legalDoc.hash}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">IP de Firma</span><span className="text-zinc-300 font-mono text-[9px]">{legalDoc.ip || 'No registrada'}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">Dispositivo</span><span className="text-zinc-300 text-[9px] truncate block">{legalDoc.userAgent || 'No registrado'}</span></div>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500 flex gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold uppercase">CONTRATO NO ACEPTADO</p>
                                <p className="text-[10px] opacity-80">Este conductor todavía no aceptó el contrato legal obligatorio y no puede operar.</p>
                            </div>
                        </div>
                    )}
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
                        
                        <div className="flex items-center space-x-2 p-3 mt-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <Switch id="mandatory_toggle" checked={isMandatoryDoc} onCheckedChange={setIsMandatoryDoc} />
                            <label htmlFor="mandatory_toggle" className="text-xs font-bold text-red-400 cursor-pointer">
                                {isMandatoryDoc ? 'Obligatoria (Bloquea al conductor)' : 'Informativa (No bloquea)'}
                            </label>
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

                    {/* VISUALIZADOR DE REQUERIMIENTOS DOCUMENTALES */}
                    {docRequests.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-indigo-500/10">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Historial de Requerimientos</Label>
                            <div className="space-y-3">
                                {docRequests.map((req) => (
                                    <div key={req.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-bold text-white uppercase">{DOC_OPTIONS.find(o => o.id === req.docType)?.label || req.docType}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] uppercase font-black",
                                                        req.status === 'approved' ? 'border-green-500/30 text-green-400' :
                                                        req.status === 'rejected' ? 'border-red-500/30 text-red-400' :
                                                        req.status === 'uploaded' ? 'border-indigo-500/30 text-indigo-400' :
                                                        'border-zinc-500/30 text-zinc-400'
                                                    )}>
                                                        {req.status === 'approved' ? 'Aprobado' :
                                                         req.status === 'rejected' ? 'Rechazado' :
                                                         req.status === 'uploaded' ? 'Subido' : 'Pendiente'}
                                                    </Badge>
                                                    {req.isMandatory && (
                                                        <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-400 text-[9px] uppercase font-black">Obligatorio</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {req.uploadedUrl && (
                                            <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-black aspect-video max-w-sm">
                                                {req.uploadedUrl.includes('.pdf') ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                                                        <FileText className="h-8 w-8 text-zinc-500 mb-2" />
                                                        <span className="text-xs text-zinc-400 font-bold">Documento PDF</span>
                                                    </div>
                                                ) : (
                                                    <img src={req.uploadedUrl} className="w-full h-full object-cover" />
                                                )}
                                                <button 
                                                    onClick={() => window.open(req.uploadedUrl, '_blank')}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                                                >
                                                    <VamoIcon name="external-link" className="h-8 w-8 text-white" />
                                                </button>
                                            </div>
                                        )}

                                        {req.status === 'uploaded' && (
                                            <div className="flex items-center gap-2 pt-2">
                                                <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-[10px] font-black uppercase tracking-widest" onClick={async () => {
                                                    await callCloudFunction('adminReviewDocumentRequestV1', { driverId, requestId: req.id, status: 'approved' }, 'Documento aprobado.');
                                                }}>
                                                    <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
                                                </Button>
                                                <Button size="sm" variant="destructive" className="flex-1 h-8 text-[10px] font-black uppercase tracking-widest" onClick={async () => {
                                                    const reason = window.prompt("Motivo del rechazo:");
                                                    if (reason === null) return;
                                                    await callCloudFunction('adminReviewDocumentRequestV1', { driverId, requestId: req.id, status: 'rejected', adminNote: reason }, 'Documento rechazado.');
                                                }}>
                                                    Rechazar
                                                </Button>
                                            </div>
                                        )}
                                        {req.adminNote && (
                                            <p className="text-[10px] text-zinc-400 italic">Nota Admin: {req.adminNote}</p>
                                        )}
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

      <DriverHistorySection driverId={driverId} />
    </div>
  );
}

function DriverHistorySection({ driverId }: { driverId: string }) {
    const firestore = useFirestore();
    const [rides, setRides] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRide, setSelectedRide] = useState<any | null>(null);

    useEffect(() => {
        if (!firestore || !driverId) return;

        const q = query(
            collection(firestore, 'rides'),
            where('driverId', '==', driverId),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedRides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRides(fetchedRides);
            setLoading(false);
        }, (err) => {
            console.error('[HISTORY_FETCH_ERROR]', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, driverId]);

    if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

    return (
        <Card className="border-zinc-800 bg-black/20">
            <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-400" /> Historial de Viajes
                </CardTitle>
                <CardDescription>Últimos 50 viajes realizados por este conductor.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                <th className="p-3">Fecha/Hora</th>
                                <th className="p-3">Pasajero</th>
                                <th className="p-3">Trayecto</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3 text-right">Comisión</th>
                                <th className="p-3 text-right">Total</th>
                                <th className="p-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {rides.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-zinc-500 italic">No se registraron viajes aún.</td>
                                </tr>
                            ) : (
                                rides.map((ride) => (
                                    <tr key={ride.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-3 align-top">
                                            <p className="font-bold text-zinc-200">
                                                {ride.createdAt?.toDate?.()?.toLocaleDateString('es-AR') || '---'}
                                            </p>
                                            <p className="text-[10px] text-zinc-500">
                                                {ride.createdAt?.toDate?.()?.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) || '---'}
                                            </p>
                                        </td>
                                        <td className="p-3 align-top">
                                            <p className="font-bold text-zinc-200">{ride.passengerName || 'Desconocido'}</p>
                                            <p className="text-[9px] text-zinc-500 font-mono">UID: {ride.passengerId?.substring(0,8) || 'N/A'}...</p>
                                        </td>
                                        <td className="p-3 align-top max-w-xs">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                                    <p className="text-[10px] text-zinc-400 truncate">{ride.origin?.address}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-sm bg-primary shrink-0" />
                                                    <p className="text-[10px] text-zinc-400 truncate">{ride.destination?.address}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 align-top">
                                            <Badge 
                                                variant="outline" 
                                                className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-2",
                                                    ride.status === 'completed' ? "border-green-500/30 text-green-500 bg-green-500/5" :
                                                    ride.status === 'cancelled' ? "border-red-500/30 text-red-500 bg-red-500/5" :
                                                    "border-zinc-700 text-zinc-500"
                                                )}
                                            >
                                                {ride.status === 'completed' ? 'Completado' :
                                                 ride.status === 'cancelled' ? 'Cancelado' :
                                                 ride.status}
                                            </Badge>
                                        </td>
                                        <td className="p-3 align-top text-right font-medium text-zinc-400">
                                            {formatCurrency(ride.completedRide?.commissionAmount || 0)}
                                        </td>
                                        <td className="p-3 align-top text-right font-black text-white">
                                            {formatCurrency(ride.completedRide?.totalFare || ride.pricing?.estimatedTotal || 0)}
                                        </td>

                                        <td className="p-3 align-top text-right">
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-8 rounded-xl text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 font-bold text-[10px] uppercase"
                                                        onClick={() => setSelectedRide(ride)}
                                                    >
                                                        <FileText className="h-3.5 w-3.5 mr-1" /> Recibo
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="p-0 bg-transparent border-none max-w-lg">
                                                    {selectedRide && (
                                                        <RideReceipt 
                                                            ride={selectedRide} 
                                                            onClose={() => {}} // Controlled by Dialog
                                                            closeLabel="Cerrar Comprobante"
                                                        />
                                                    )}
                                                </DialogContent>
                                            </Dialog>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

