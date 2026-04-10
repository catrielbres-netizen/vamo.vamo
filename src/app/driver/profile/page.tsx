
'use client';

import React, { useRef, useState } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VamoIcon } from '@/components/VamoIcon';
import { UserProfile, VerificationStatus, DriverLevel } from '@/lib/types';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { doc, updateDoc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useDriverStats } from '@/hooks/useDriverStats';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { NotificationToggle } from '@/components/NotificationToggle';

const verificationStatusBadge: Record<NonNullable<VerificationStatus> | 'default', { text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    unverified: { text: 'No Verificado', variant: 'destructive' },
    pending_review: { text: 'Pendiente', variant: 'secondary' },
    approved: { text: 'Aprobado', variant: 'default' },
    rejected: { text: 'Rechazado', variant: 'destructive' },
    default: { text: 'No Verificado', variant: 'destructive' },
};

const levelBadgeStyles: Record<DriverLevel | 'default', string> = {
    bronce: "bg-yellow-700/20 text-yellow-800 border-yellow-700/30",
    plata: "bg-gray-400/20 text-gray-500 border-gray-400/30",
    oro: "bg-yellow-400/20 text-yellow-500 border-yellow-400/30",
    default: "bg-gray-400/20 text-gray-500 border-gray-400/30",
};

const DOC_LABELS: Record<string, string> = {
    dni: 'DNI (Frente y Dorso)',
    licencia: 'Licencia de Conducir',
    cedula: 'Cédula del Vehículo',
    habilitacion: 'Habilitación Taxi/Remis',
    seguro: 'Póliza de Seguro',
    antecedentes: 'Certificado Antecedentes',
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


const ProfileInfoRow = ({ icon, label, value, children }: { icon: React.ReactNode, label: string, value?: string | number | null, children?: React.ReactNode }) => (
    <div className="flex items-start gap-4 text-sm">
        <div className="text-muted-foreground w-6 pt-0.5">{icon}</div>
        <div className="flex-1">
            <p className="text-muted-foreground">{label}</p>
            {value && <p className="font-medium">{value}</p>}
            {children}
        </div>
    </div>
);


export default function DriverProfilePage() {
  const { profile, user, loading: userLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const firebaseApp = useFirebaseApp();

  const [services, setServices] = useState(profile?.servicesOffered || { express: true, premium: true });
  const [isSavingServices, setIsSavingServices] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!user || !firestore) return;
    
    const q = query(
        collection(firestore, 'referrals'),
        where('referrerId', '==', user.uid),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const refs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReferrals(refs);
        setLoadingReferrals(false);
    }, (error) => {
        console.error("Error fetching referrals:", error);
        setLoadingReferrals(false);
    });

    return () => unsubscribe();
  }, [user, firestore]);

  const handleGenerateCode = async () => {
    if (!firebaseApp || isGeneratingCode) return;
    
    setIsGeneratingCode(true);
    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const generateCode = httpsCallable<any, { referralCode: string }>(functions, 'generateReferralCodeV1');
        const result = await generateCode();
        if (result.data?.referralCode) {
            toast({ title: "Código generado", description: "Ya podés invitar a otros conductores." });
        }
    } catch (error: any) {
        console.error("Error generating code:", error);
        toast({ 
            variant: 'destructive', 
            title: "Error al generar código", 
            description: "No pudimos generar tu código. Reintentá en unos minutos." 
        });
    } finally {
        setIsGeneratingCode(false);
    }
  };

  const handleShare = async () => {
    const code = profile?.referralCode;
    if (!code) {
        handleGenerateCode();
        return;
    }

    const registrationLink = `https://vamoapp.online/driver?ref=${code}`;
    const shareText = `Sumate a manejar con VamO y ganá más 🚀\nRegistrate desde mi link:\n${registrationLink}`;
    const shareData = {
        title: 'VamO Conductor 🚀',
        text: shareText,
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Share failed', err);
                copyToClipboard(shareText);
            }
        }
    } else {
        copyToClipboard(shareText);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
        .then(() => {
            toast({ title: "Código copiado", description: "Pegalo y compartilo con otros conductores." });
        })
        .catch((err) => {
            console.error('Clipboard copy failed', err);
            toast({ 
                variant: 'destructive', 
                title: "Error al copiar", 
                description: "No se pudo copiar el código. Intentá seleccionarlo manualmente." 
            });
        });
  };

  const handleLogout = async () => {
    if (auth) {
        await signOut(auth)
        router.push('/login')
    }
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !user || !firebaseApp || !firestore) {
      return;
    }
    const file = event.target.files[0];
    const storage = getStorage(firebaseApp);
    const storageRef = ref(storage, `profile_photos/${user.uid}/avatar.jpg`);

    setIsUploading(true);
    try {
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, {
        photoURL: downloadURL
      });

      toast({ title: "Foto de perfil actualizada", description: "Tu nueva foto ya es visible." });
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast({ variant: 'destructive', title: "Error al subir la foto", description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const [isUploadingDoc, setIsUploadingDoc] = useState<string | null>(null);

  const handleDocUpload = async (docId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !user || !firebaseApp || !firestore) return;
    const file = event.target.files[0];
    const storage = getStorage(firebaseApp);
    const storageRef = ref(storage, `driver_documents/${user.uid}/${docId}_${Date.now()}.jpg`);

    setIsUploadingDoc(docId);
    try {
        const uploadResult = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);

        const userDocRef = doc(firestore, 'users', user.uid);
        const currentSubmitted = profile?.documentsSubmitted || {};
        
        await updateDoc(userDocRef, {
            [`documentsSubmitted.${docId}`]: {
                url: downloadURL,
                uploadedAt: new Date(),
            },
            manualReviewStatus: 'docs_submitted'
        });

        toast({ title: "Documento subido", description: `${DOC_LABELS[docId] || docId} se guardó correctamente.` });
    } catch (error: any) {
        console.error("Error uploading doc:", error);
        toast({ variant: 'destructive', title: "Error al subir documento", description: error.message });
    } finally {
        setIsUploadingDoc(null);
    }
  };

  const handleServiceToggle = async () => {
    if (!firestore || !user) return;
    
    const newServices = { 
      normal: true,
      premium: true,
      express: !services.express 
    };
    
    setIsSavingServices(true);
    setServices(newServices);
    
    try {
        const userRef = doc(firestore, 'users', user.uid);
        await updateDoc(userRef, { servicesOffered: newServices });
        toast({ title: 'Servicios actualizados', description: `Ahora ${newServices.express ? 'recibirás' : 'no recibirás'} viajes Express.` });
    } catch (e) {
        console.error("Error updating services", e);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la configuración de servicios.' });
        setServices(profile?.servicesOffered || { premium: true, express: true });
    } finally {
        setIsSavingServices(false);
    }
  }

  const { weeklyRevenue, weeklyRides, loading: statsLoading } = useDriverStats();
  const isLoading = userLoading || !profile;

  if (isLoading) {
    return (
        <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
    );
  }

  const verificationStatusKey = profile.vehicleVerificationStatus || 'default';
  const verificationInfo = verificationStatusBadge[verificationStatusKey] || verificationStatusBadge.default;
  
  const levelKey = profile.driverLevel || 'default';
  const levelBadgeStyle = levelBadgeStyles[levelKey] || levelBadgeStyles.default;

  const averageRating = profile.averageRating?.toFixed(1) ?? 'N/A';
  const balance = profile.currentBalance ?? 0;
  
  const matchingScore = profile.matchingScore ?? 100;
  const ridesCompleted = profile.stats?.ridesCompleted ?? 0;
  const PROMO_RIDE_THRESHOLD = 10;
  const isInPromoPeriod = profile.promoCreditGranted && ridesCompleted < PROMO_RIDE_THRESHOLD;

  const isPremiumTier = profile.serviceTier === 'premium';
  const missingPhotos = !profile.photoURL || !profile.vehicleFrontPhotoURL;

  return (
    <div className="space-y-6">
      {missingPhotos && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-amber-500 text-lg flex gap-2 items-center">
              <VamoIcon name="alert-triangle" className="w-5 h-5" /> Faltan fotos de perfil
            </CardTitle>
            <CardDescription className="text-amber-500/80 font-bold text-xs uppercase tracking-widest mt-1">
              Tu cuenta no tiene foto de perfil o foto de vehículo. Pronto será obligatorio subir ambas para poder conectarte y recibir viajes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* MANUAL DOCUMENTATION REVIEW CARD */}
      {profile.requiresManualReview && (
          <Card className={cn(
              "border-indigo-500/30",
              profile.manualReviewStatus === 'approved' ? "bg-green-500/5 border-green-500/30" : "bg-indigo-500/5"
          )}>
              <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-indigo-500 text-lg flex gap-2 items-center">
                        <VamoIcon name="file-text" className="w-5 h-5" /> 
                        {profile.manualReviewStatus === 'approved' ? 'Verificación Aprobada' : 'Verificación Manual de Documentos'}
                    </CardTitle>
                    {profile.manualReviewStatus && (
                        <Badge variant={profile.manualReviewStatus === 'approved' ? 'default' : 'secondary'} className="uppercase font-black text-[9px]">
                            {profile.manualReviewStatus === 'approved' ? 'Aprobado' :
                             profile.manualReviewStatus === 'docs_submitted' ? 'En Revisión' :
                             profile.manualReviewStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}
                        </Badge>
                    )}
                  </div>
                  <CardDescription className="text-indigo-400 font-medium text-xs">
                      {profile.manualReviewStatus === 'approved' 
                        ? 'Tu documentación profesional ha sido validada por administración.'
                        : 'Como conductor de Taxi/Remis, necesitamos validar tu documentación adicional antes de la habilitación completa.'
                      }
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  {profile.adminReviewNote && (
                      <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                          <p className="text-[10px] font-black uppercase text-indigo-400 mb-1">Nota de Administración:</p>
                          <p className="text-xs text-white italic">"{profile.adminReviewNote}"</p>
                      </div>
                  )}

                  {profile.manualReviewStatus !== 'approved' && (
                      <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Documentos Solicitados</p>
                          <div className="grid gap-2">
                              {(profile.documentsRequested || []).map((docId: string) => {
                                  const isUploaded = !!profile.documentsSubmitted?.[docId];
                                  return (
                                      <div key={docId} className="flex items-center justify-between p-3 bg-background/40 rounded-xl border border-border/50">
                                          <div className="flex items-center gap-3">
                                              <div className={cn(
                                                  "h-8 w-8 rounded-full flex items-center justify-center",
                                                  isUploaded ? "bg-green-500/20 text-green-500" : "bg-indigo-500/20 text-indigo-400"
                                              )}>
                                                  {isUploaded ? <VamoIcon name="check" className="h-4 w-4" /> : <VamoIcon name="upload" className="h-4 w-4" />}
                                              </div>
                                              <div>
                                                  <p className="text-xs font-bold">{DOC_LABELS[docId] || docId}</p>
                                                  <p className="text-[9px] text-muted-foreground">{isUploaded ? 'Documento recibido' : 'Pendiente de subida'}</p>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              {isUploaded && profile.documentsSubmitted?.[docId]?.url && (
                                                   <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-400" onClick={() => window.open(profile.documentsSubmitted?.[docId]?.url, '_blank')}>
                                                        <VamoIcon name="eye" className="h-4 w-4" />
                                                   </Button>
                                              )}
                                              <input
                                                  type="file"
                                                  id={`doc-input-${docId}`}
                                                  className="hidden"
                                                  accept="image/*"
                                                  onChange={(e) => handleDocUpload(docId, e)}
                                              />
                                              <Button 
                                                  size="sm" 
                                                  variant={isUploaded ? "outline" : "default"} 
                                                  className="h-8 text-[10px] font-bold uppercase"
                                                  disabled={isUploadingDoc === docId}
                                                  onClick={() => document.getElementById(`doc-input-${docId}`)?.click()}
                                              >
                                                  {isUploadingDoc === docId ? "Subiendo..." : isUploaded ? "Cambiar" : "Subir Foto"}
                                              </Button>
                                          </div>
                                      </div>
                                  );
                              })}
                              {(!profile.documentsRequested || profile.documentsRequested.length === 0) && (
                                  <p className="text-xs text-muted-foreground italic p-4 text-center bg-muted/20 rounded-xl">
                                      Administración aún no ha especificado qué documentos requiere.
                                  </p>
                              )}
                          </div>
                      </div>
                  )}
              </CardContent>
          </Card>
      )}

      {/* PERFORMANCE & STATS CARD */}
      <Card className="border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <VamoIcon name="trending-up" className="h-24 w-24 text-indigo-500" />
        </div>
        <CardHeader>
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <CardTitle className="text-xl">Rendimiento PRO</CardTitle>
                    <CardDescription>Tu estatus actual en la plataforma</CardDescription>
                </div>
                <Badge className={cn("uppercase font-black tracking-widest px-3 py-1", levelBadgeStyle)}>
                    Nivel {levelKey}
                </Badge>
            </div>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/60 p-4 rounded-2xl border border-indigo-500/10 flex flex-col items-center text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Score de Prioridad</span>
                    <span className={cn(
                        "text-3xl font-black tabular-nums",
                        matchingScore > 80 ? "text-indigo-500" : matchingScore > 50 ? "text-amber-500" : "text-destructive"
                    )}>
                        {matchingScore}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground mt-1 italic">Exacto</span>
                </div>
                <div className="bg-background/60 p-4 rounded-2xl border border-indigo-500/10 flex flex-col items-center text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Viajes (7d)</span>
                    <span className="text-3xl font-black text-white">
                        {statsLoading ? "..." : weeklyRides}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground mt-1">Acumulados</span>
                </div>
            </div>

            <div className="mt-4 p-4 bg-indigo-500/10 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <VamoIcon name="award" className="text-indigo-400 h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-tighter leading-none">Recaudación Semanal</p>
                        <p className="text-sm font-bold text-white">{statsLoading ? "Cargando..." : formatCurrency(weeklyRevenue)}</p>
                    </div>
                </div>
                <div className="text-[9px] text-indigo-400/60 font-medium text-right max-w-[80px]">
                    Estimado en efectivo
                </div>
            </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-primary/50">
                    <AvatarImage src={profile.photoURL || undefined} alt={profile.name} />
                    <AvatarFallback className="text-3xl">{profile.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <Button
                    size="icon"
                    className="absolute bottom-0 right-0 rounded-full h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    aria-label="Cambiar foto de perfil"
                >
                    {isUploading ? <VamoIcon name="loader" className="animate-spin h-4 w-4" /> : <VamoIcon name="pencil" className="h-4 w-4" />}
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    className="hidden"
                    accept="image/png, image/jpeg"
                />
            </div>
             <div className="text-center">
                <CardTitle className="text-2xl">{profile.name}</CardTitle>
                <CardDescription>Conductor en VamO</CardDescription>
             </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex justify-around items-center text-center">
                <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge variant={verificationInfo.variant}>{verificationInfo.text}</Badge>
                </div>
            </div>
            <Separator />
            <ProfileInfoRow icon={<VamoIcon name="mail" />} label="Email" value={profile.email} />
            <ProfileInfoRow icon={<VamoIcon name="phone" />} label="Teléfono" value={profile.phone} />
            <ProfileInfoRow 
              icon={<VamoIcon name="wallet" />} 
              label="Crédito de Plataforma"
            >
                <p className={cn("text-lg font-bold", balance >= 0 ? "text-green-500" : "text-destructive")}>{formatCurrency(balance)}</p>
                {isInPromoPeriod && (
                  <p className="text-xs text-muted-foreground">Incluye tu bono de bienvenida de {formatCurrency(2000)}. Las comisiones de tus primeros {PROMO_RIDE_THRESHOLD} viajes se deducirán de aquí.</p>
                )}
            </ProfileInfoRow>
        </CardContent>
         <Separator />
          <CardHeader>
            <CardTitle className="text-lg">Vehículo</CardTitle>
          </CardHeader>
           <CardContent className="space-y-4">
                <ProfileInfoRow icon={<VamoIcon name="car" />} label="Modelo" value={`${profile.vehicleModel || 'No especificado'} (${profile.carModelYear})`} />
                <ProfileInfoRow icon={<VamoIcon name="palette" />} label="Color" value={profile.vehicleColor || 'No especificado'} />
                <ProfileInfoRow icon={<VamoIcon name="credit-card" />} label="Patente" value={profile.plateNumber || 'No especificada'} />
           </CardContent>
      </Card>

      <Card className="border-primary/20 bg-background/50">
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <VamoIcon name="bell" className="text-primary h-5 w-5" />
                  Notificaciones
              </CardTitle>
              <CardDescription>Asegurate de activarlas para escuchar nuevos viajes en segundo plano.</CardDescription>
          </CardHeader>
          <CardContent>
              <NotificationToggle />
          </CardContent>
      </Card>

      <Card>
          <CardHeader>
              <CardTitle>Gestión de Servicios</CardTitle>
              <CardDescription>Elegí qué tipo de viajes querés recibir. Tu categoría base es <span className="font-bold capitalize">{profile.serviceTier || 'No definida'}</span>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-md border opacity-70">
                   <Label htmlFor="premium-switch" className="flex flex-col gap-1 cursor-not-allowed">
                      <span>Aceptar Viajes Premium</span>
                      <span className="font-normal text-xs text-muted-foreground">{isPremiumTier ? 'Servicio obligatorio para tu categoría.' : 'No disponible para tu categoría.'}</span>
                  </Label>
                  <Switch id="premium-switch" checked={isPremiumTier} disabled={true} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border">
                  <Label htmlFor="express-switch" className="flex flex-col gap-1">
                      <span>Aceptar Viajes Express</span>
                      <span className="font-normal text-xs text-muted-foreground">{isPremiumTier ? 'Opcional para recibir más viajes.' : 'Servicio obligatorio para tu categoría.'}</span>
                  </Label>
                  <Switch id="express-switch" checked={services.express} onCheckedChange={handleServiceToggle} disabled={isSavingServices || !isPremiumTier} />
              </div>
          </CardContent>
      </Card>

      {/* REFERRAL ENGINE UI */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <VamoIcon name="users" className="text-green-500 h-6 w-6"/> Invitá y Ganá $1.000
                    </CardTitle>
                    <CardDescription>
                        Por cada conductor que refieras y complete su primer viaje.
                    </CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="bg-background/80 p-5 rounded-2xl border flex flex-col items-center gap-4 text-center">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Tu código de referido</p>
                <div className="flex items-center gap-3">
                    <span className="text-3xl font-black tracking-tight font-mono text-primary">
                        {isGeneratingCode ? (
                            <VamoIcon name="loader" className="animate-spin h-6 w-6 text-primary" />
                        ) : (
                            profile.referralCode || 'SIN CÓDIGO'
                        )}
                    </span>
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-primary hover:bg-primary/10 rounded-full"
                        onClick={handleShare}
                        disabled={isGeneratingCode || !profile.referralCode}
                    >
                        <VamoIcon name="share-2" className="h-5 w-5" />
                    </Button>
                </div>
                {!profile.referralCode && !isGeneratingCode ? (
                    <Button 
                        variant="default" 
                        className="w-full h-12 font-bold rounded-xl"
                        onClick={handleGenerateCode}
                    >
                        Generar mi Código
                    </Button>
                ) : (
                    <Button 
                        variant="default" 
                        className="w-full h-12 font-bold rounded-xl"
                        onClick={handleShare}
                        disabled={isGeneratingCode || !profile.referralCode}
                    >
                        {isGeneratingCode ? 'Generando...' : 'Compartir Código'}
                    </Button>
                )}
            </div>

            <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest px-1">Referidos ({referrals.length})</p>
                
                {loadingReferrals ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                ) : referrals.length === 0 ? (
                    <div className="py-8 text-center bg-muted/20 rounded-2xl border border-dashed">
                        <p className="text-xs text-muted-foreground">Aún no tienes referidos.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {referrals.map((ref) => (
                            <div key={ref.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/50">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center",
                                        ref.status === 'rewarded' ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
                                    )}>
                                        <VamoIcon name="user" className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold truncate max-w-[120px]">
                                            {ref.referredUserName || `Chofer ${ref.referredId.substring(0,6)}...`}
                                        </span>
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase",
                                            ref.status === 'rewarded' ? "text-green-500" : "text-amber-500"
                                        )}>
                                            {ref.status === 'rewarded' ? '🏆 Acreditado' : '⏳ Pendiente'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {ref.createdAt?.toDate?.().toLocaleDateString() || '...'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </CardContent>
      </Card>

       <Card>
        <CardContent className="pt-6">
             <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
                Cerrar Sesión
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
