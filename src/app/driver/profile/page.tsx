
'use client';

import React, { useRef, useState, useEffect } from 'react';
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
import { doc, updateDoc, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useDriverStats } from '@/hooks/useDriverStats';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { NotificationToggle } from '@/components/NotificationToggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { ShieldAlert, Trash, Pencil, MessageSquare, QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { formatRating } from '@/lib/formatters';

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


const ProfileInfoCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value?: string | number | null }) => (
    <div className="flex items-center gap-4 p-4 bg-zinc-950/20 rounded-2xl border border-white/[0.03]">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 shrink-0">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 leading-none mb-1">{label}</p>
            <p className="text-sm font-bold text-zinc-300 truncate">{value || 'No especificado'}</p>
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
  const [recentRatings, setRecentRatings] = useState<any[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STRICT ONBOARDING REDIRECT ---
  useEffect(() => {
    if (profile && !profile.profileCompleted) {
        console.log("🛡️ [PROFILE] Incomplete profile. Redirecting to onboarding wizard...");
        router.replace('/driver/register');
    }
  }, [profile, router]);

  useEffect(() => {
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

  // [VamO PRO] Fetch recent ratings with comments
  useEffect(() => {
    if (!user || !firestore) return;
    
    const q = query(
        collection(firestore, 'rides'),
        where('driverId', '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const ratedRides = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((r: any) => !!r.driverRatingByPassenger && !!r.driverComments)
            .slice(0, 3);
        setRecentRatings(ratedRides);
        setLoadingRatings(false);
    }, (error) => {
        console.error("Error fetching ratings:", error);
        setLoadingRatings(false);
    });

    return () => unsubscribe();
  }, [user, firestore]);

  // [VamO PRO] Public Profile is synced automatically via Cloud Functions (backend)
  // on every relevant change to users or municipal_profiles documents.

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

  const handlePreferenceToggle = async (key: string, value: boolean) => {
    if (!firestore || !user) return;
    
    setIsSavingPreferences(true);
    try {
        const userRef = doc(firestore, 'users', user.uid);
        await updateDoc(userRef, { 
            [`driverPreferences.${key}`]: value,
            updatedAt: new Date()
        });
        toast({ 
            title: 'Preferencia actualizada', 
            description: `Se ha ${value ? 'activado' : 'desactivado'} correctamente.` 
        });
    } catch (e) {
        console.error("Error updating preference", e);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la configuración.' });
    } finally {
        setIsSavingPreferences(false);
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

  const averageRating = formatRating(profile.averageRating, 'N/A');
  const balance = profile.currentBalance ?? 0;
  
  const matchingScore = profile.matchingScore ?? 100;
  const ridesCompleted = profile.stats?.ridesCompleted ?? 0;
  const PROMO_RIDE_THRESHOLD = 10;
  const isInPromoPeriod = profile.promoCreditGranted && ridesCompleted < PROMO_RIDE_THRESHOLD;

  const isPremiumTier = profile.serviceTier === 'premium';
  const missingPhotos = !profile.photoURL || !profile.vehicleFrontPhotoURL;

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 pb-20">
      <div className="mb-6 px-1">
        <h1 className="text-3xl font-black tracking-tight mb-2">Mi Perfil</h1>
        <p className="text-muted-foreground text-sm">Gestiona tus datos, progresos y seguridad.</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-14 bg-zinc-900/50 rounded-2xl p-1 mb-6">
          <TabsTrigger value="general" className="rounded-xl font-bold text-[10px] uppercase">Perfil</TabsTrigger>
          <TabsTrigger value="docs" className="rounded-xl font-bold text-[10px] uppercase">Docs</TabsTrigger>
          <TabsTrigger value="pro" className="rounded-xl font-bold text-[10px] uppercase">PRO</TabsTrigger>
          <TabsTrigger value="referral" className="rounded-xl font-bold text-[10px] uppercase">Refs</TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl font-bold text-[10px] uppercase">SOS</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 animate-in fade-in duration-300">
          {/* [VamO PRO] Digital Credential / QR Control */}
          <Card className="rounded-3xl border-indigo-500/20 bg-gradient-to-br from-zinc-900 to-indigo-900/10 shadow-xl overflow-hidden mb-6">
                <CardContent className="p-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="p-4 bg-white rounded-3xl shadow-2xl">
                            <QRCodeCanvas 
                                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://vamoapp.online'}/verify/driver/${user?.uid}`}
                                size={180}
                                level="H"
                                marginSize={2}
                            />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter flex items-center justify-center gap-2">
                                <QrCode className="w-5 h-5 text-indigo-400" /> Credencial Digital
                            </h3>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Válida para Control de Tránsito</p>
                        </div>
                        <div className="w-full pt-2">
                            <Button 
                                variant="outline" 
                                className="w-full h-10 rounded-xl border-indigo-500/20 bg-indigo-500/5 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/10"
                                onClick={() => window.open(`/verify/driver/${user?.uid}`, '_blank')}
                            >
                                Previsualizar Credencial Pública
                            </Button>
                        </div>
                    </div>
                </CardContent>
          </Card>

          {missingPhotos && (
            <Card className="border-amber-500/30 bg-amber-500/10 mb-4">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-amber-500 text-sm flex gap-2 items-center">
                  <ShieldAlert className="w-4 h-4" /> Faltan fotos obligatorias
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          <Card className="rounded-3xl border-zinc-800 bg-zinc-900/40 shadow-xl overflow-hidden">
                <CardContent className="p-0">
                    <div className="bg-gradient-to-b from-indigo-500/20 to-transparent p-8 flex flex-col items-center gap-4">
                        <div className="relative">
                            <Avatar className="h-28 w-28 border-4 border-zinc-900 shadow-2xl shadow-indigo-500/20 font-bold">
                                <AvatarImage src={profile.photoURL || undefined} alt={profile.name} className="object-cover" />
                                <AvatarFallback className="text-4xl font-bold text-indigo-400 bg-indigo-500/10">
                                    {profile.name?.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <Button
                                size="icon"
                                className="absolute bottom-0 right-0 rounded-full h-10 w-10 bg-indigo-600 hover:bg-indigo-700 shadow-xl border-2 border-zinc-900"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                {isUploading ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : <VamoIcon name="pencil" className="h-5 w-5" />}
                            </Button>
                            <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/png, image/jpeg" />
                        </div>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <h2 className="text-2xl font-black text-white">{profile.name}</h2>
                                {profile.municipalStatus === 'active' && (
                                    <div className="bg-indigo-500 p-1 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-white/20 animate-pulse">
                                        <VamoIcon name="shield-check" className="w-4 h-4 text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <Badge variant={verificationInfo.variant} className="uppercase font-black text-[9px] px-2">{verificationInfo.text}</Badge>
                                <Badge className={cn("uppercase font-black text-[9px] px-2", levelBadgeStyle)}>Nivel {levelKey}</Badge>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6 space-y-6 bg-zinc-900/20">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-950/50 p-4 rounded-2xl border border-white/5 text-center group transition-all hover:bg-zinc-950">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Puntos VamO</p>
                                <p className="text-xl font-black text-white">{profile.vamoPoints || 0}</p>
                                <p className="text-[8px] font-bold text-zinc-600 uppercase mt-1">Acumulados</p>
                            </div>
                            <div className="bg-zinc-950/50 p-4 rounded-2xl border border-white/5 text-center group transition-all hover:bg-zinc-950">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Calificación</p>
                                <p className="text-xl font-black text-primary">{averageRating}</p>
                                <p className="text-[8px] font-bold text-zinc-600 uppercase mt-1">Promedio</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <ProfileInfoCard 
                                icon={<VamoIcon name="mail" className="w-4 h-4" />} 
                                label="Email de contacto" 
                                value={profile.email} 
                            />
                            <ProfileInfoCard 
                                icon={<VamoIcon name="phone" className="w-4 h-4" />} 
                                label="Teléfono / WhatsApp" 
                                value={profile.phone} 
                            />
                            <div className="grid grid-cols-1 gap-4 pt-2">
                                <div className="bg-zinc-950/40 p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-indigo-400 transition-colors">
                                            <VamoIcon name="car" className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Vehículo Registrado</p>
                                            <p className="text-sm font-black text-white uppercase italic tracking-tighter">
                                                {profile.vehicle?.brand || profile.vehicleBrand || ''} {profile.vehicle?.model || profile.vehicleModel || 'N/A'}
                                            </p>
                                            <p className="text-[10px] font-bold text-zinc-500 mt-0.5">
                                                {profile.vehicle?.color || profile.vehicleColor || 'Color no especificado'} • {profile.vehicle?.year || profile.carModelYear || ''}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-zinc-950/40 p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-emerald-400 transition-colors">
                                            <VamoIcon name="credit-card" className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Patente / Placa</p>
                                            <p className="text-xl font-black text-white tracking-[0.1em] uppercase font-mono">
                                                {profile.vehicle?.plate || profile.plateNumber || '--- ---'}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] font-black">OFICIAL</Badge>
                                </div>

                                <div className="bg-zinc-950/40 p-5 rounded-[1.5rem] border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-indigo-400 transition-colors">
                                            <VamoIcon name="percent" className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Tarifa Dinámica</p>
                                            <p className="text-sm font-black text-white">Aceptar descuentos</p>
                                            <p className="text-[10px] text-zinc-500 mt-0.5">
                                                {profile.driverSubtype === 'express' 
                                                    ? 'Obligatorio para conductores Express' 
                                                    : 'Recibí más viajes con tarifa variable'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={profile.driverSubtype === 'express' || !!profile.driverPreferences?.acceptsDiscountedRides}
                                        disabled={profile.driverSubtype === 'express' || isSavingPreferences}
                                        onCheckedChange={(val) => handlePreferenceToggle('acceptsDiscountedRides', val)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

          <Card className="border-zinc-800 bg-background/50">
              <CardHeader className="py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                      <VamoIcon name="bell" className="text-primary h-5 w-5" />
                      Notificaciones en vivo
                  </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                  <NotificationToggle />
              </CardContent>
          </Card>

          <Button variant="ghost" className="w-full text-zinc-500 font-bold" onClick={handleLogout}>
              Cerrar Sesión Activa
          </Button>
        </TabsContent>

        <TabsContent value="docs" className="space-y-4 animate-in fade-in duration-300">
          <Card className={cn(
              "border-indigo-500/30",
              profile.manualReviewStatus === 'approved' ? "bg-green-500/5 border-green-500/30" : "bg-indigo-500/5"
          )}>
              <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-indigo-500 text-lg flex gap-2 items-center">
                        <VamoIcon name="file-text" className="w-5 h-5" /> 
                        {profile.manualReviewStatus === 'approved' ? 'Verificación Aprobada' : 'Verificación Manual'}
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
                        ? 'Tu documentación profesional ha sido validada.'
                        : 'Como conductor, necesitamos validar tu documentación.'
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

                  {profile.requiresManualReview && profile.manualReviewStatus !== 'approved' && (
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
                                                  <p className="text-[9px] text-muted-foreground">{isUploaded ? 'Recibido' : 'Pendiente'}</p>
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
                                                  {isUploadingDoc === docId ? "..." : isUploaded ? "Cambiar" : "Subir"}
                                              </Button>
                                          </div>
                                      </div>
                                  );
                              })}
                              {(!profile.documentsRequested || profile.documentsRequested.length === 0) && (
                                  <p className="text-xs text-muted-foreground italic p-4 text-center bg-muted/20 rounded-xl">
                                      Aún no se han solicitado documentos.
                                  </p>
                              )}
                          </div>
                      </div>
                  )}
              </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pro" className="space-y-4 animate-in fade-in duration-300">
          <Card className="border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <VamoIcon name="trending-up" className="h-24 w-24 text-indigo-500" />
            </div>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <CardTitle className="text-xl">Rendimiento PRO</CardTitle>
                        <CardDescription>Tu estatus en la plataforma</CardDescription>
                    </div>
                    <Badge className={cn("uppercase font-black tracking-widest px-3 py-1", levelBadgeStyle)}>
                        Nivel {levelKey}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background/60 p-4 rounded-2xl border border-indigo-500/10 flex flex-col items-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Score Prioridad</span>
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
                </div>

                {/* [VamO PRO] Recent Ratings Section */}
                <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic">Comentarios Recientes</p>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[9px] font-black uppercase text-indigo-400"
                            onClick={() => router.push('/dashboard/history')}
                        >
                            Ver Todo el Historial
                        </Button>
                    </div>
                    
                    {loadingRatings ? (
                        <Skeleton className="h-20 w-full rounded-2xl" />
                    ) : recentRatings.length === 0 ? (
                        <div className="p-6 bg-zinc-900/30 rounded-2xl border border-dashed border-white/5 text-center">
                            <p className="text-xs text-zinc-500 font-medium">Aún no recibiste comentarios de pasajeros.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentRatings.map((ride) => (
                                <div key={ride.id} className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 hover:bg-zinc-950/60 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <VamoIcon 
                                                    key={s} 
                                                    name="star" 
                                                    className={cn(
                                                        "w-3 h-3",
                                                        s <= (ride.driverRatingByPassenger || 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-800"
                                                    )} 
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[9px] font-bold text-zinc-600 uppercase">
                                            {ride.completedAt?.toDate?.().toLocaleDateString() || 'Reciente'}
                                        </span>
                                    </div>
                                    {ride.driverComments ? (
                                        <p className="text-xs text-zinc-300 italic leading-relaxed">"{ride.driverComments}"</p>
                                    ) : (
                                        <p className="text-[10px] text-zinc-600 font-bold uppercase italic">Sin comentarios</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referral" className="space-y-4 animate-in fade-in duration-300">
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <MessageSquare className="text-green-500 h-6 w-6"/> Invitá y Ganá
                        </CardTitle>
                        <CardDescription>
                            Por cada conductor que refieras.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-background/80 p-5 rounded-2xl border flex flex-col items-center gap-4 text-center">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Código de referido</p>
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
                        <div className="py-8 text-center bg-zinc-900/10 rounded-2xl border border-dashed border-white/5">
                            <p className="text-xs text-muted-foreground">Aún no tienes referidos.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {referrals.map((ref: any) => (
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
        </TabsContent>

        <TabsContent value="security" className="space-y-4 animate-in fade-in duration-300">
            <Card className="rounded-3xl border-red-500/20 bg-gradient-to-b from-red-500/10 to-zinc-900/40 shadow-xl overflow-hidden">
                <CardHeader className="p-6 border-b border-white/5 bg-zinc-900/20">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-2xl font-black flex items-center gap-2 text-white">
                            <ShieldAlert className="text-red-500 h-6 w-6"/> Emergencias
                        </CardTitle>
                        {(profile.emergencyContacts?.length ?? 0) < 3 && (
                            <AddContactDialog onAdd={async (contact) => {
                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                await updateDoc(userDocRef, { emergencyContacts: arrayUnion(contact) });
                                toast({ title: "Contacto de emergencia agregado" });
                            }} />
                        )}
                    </div>
                    <CardDescription className="text-sm text-zinc-400 mt-2">
                        Si accionás el botón de pánico durante un viaje, notificaremos inmediatamente a estos contactos con tu ubicación gps.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    {!profile.emergencyContacts || profile.emergencyContacts.length === 0 ? (
                        <div className="text-center py-10 bg-zinc-900/30 rounded-3xl border border-dashed border-red-500/20">
                            <ShieldAlert className="h-10 w-10 text-red-900/50 mx-auto mb-3" />
                            <p className="text-sm font-bold text-red-400/80">No tenés contactos vinculados.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {profile.emergencyContacts.map((contact: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-base font-black text-white">{contact.name}</span>
                                        <span className="text-sm text-zinc-400 font-mono">{contact.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <EditContactDialog 
                                            contact={contact}
                                            onUpdate={async (updatedContact) => {
                                                const newContacts = [...(profile.emergencyContacts || [])];
                                                newContacts[idx] = updatedContact;
                                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                                await updateDoc(userDocRef, { emergencyContacts: newContacts });
                                                toast({ title: "Contacto actualizado" });
                                            }}
                                        />
                                        <Button variant="ghost" size="icon" className="h-10 w-10 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                                            onClick={async () => {
                                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                                await updateDoc(userDocRef, { emergencyContacts: arrayRemove(contact) });
                                                toast({ title: "Contacto eliminado" });
                                            }}>
                                            <Trash className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddContactDialog({ onAdd }: { onAdd: (contact: { name: string, phone: string }) => Promise<void> }) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone) return;
        setIsSaving(true);
        try {
            await onAdd({ name, phone });
            setIsOpen(false);
            setName('');
            setPhone('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-9 rounded-xl border-primary/20 text-primary font-bold">
                    <VamoIcon name="plus" className="mr-1 h-3 w-3" /> Agregar
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-[95vw] sm:max-w-[425px] bg-zinc-950 border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black">Nuevo contacto SOS</DialogTitle>
                    <DialogDescription>
                        Ingresá los datos de tu contacto de confianza para emergencias.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Nombre</Label>
                        <Input 
                            id="name" 
                            placeholder="Ej. Esposa, Hermano" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="rounded-xl h-12 bg-zinc-900 border-white/10"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="phone">WhatsApp / Teléfono</Label>
                        <Input 
                            id="phone" 
                            placeholder="+54 9 280 ..." 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            className="rounded-xl h-12 bg-zinc-900 border-white/10"
                            required
                        />
                    </div>
                    <DialogFooter className="pt-2">
                        <Button type="submit" className="w-full h-12 rounded-xl font-black uppercase tracking-widest" disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Guardar Contacto'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditContactDialog({ contact, onUpdate }: { contact: { name: string, phone: string }, onUpdate: (contact: { name: string, phone: string }) => Promise<void> }) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState(contact.name);
    const [phone, setPhone] = useState(contact.phone);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone) return;
        setIsSaving(true);
        try {
            await onUpdate({ name, phone });
            setIsOpen(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-indigo-500/10 rounded-xl">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-[95vw] sm:max-w-[425px] bg-zinc-950 border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black">Editar contacto SOS</DialogTitle>
                    <DialogDescription>
                        Actualizá los datos de tu contacto.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-name">Nombre</Label>
                        <Input 
                            id="edit-name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="rounded-xl h-12 bg-zinc-900 border-white/10"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-phone">WhatsApp / Teléfono</Label>
                        <Input 
                            id="edit-phone" 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            className="rounded-xl h-12 bg-zinc-900 border-white/10"
                            required
                        />
                    </div>
                    <DialogFooter className="pt-2">
                        <Button type="submit" className="w-full h-12 rounded-xl font-black uppercase tracking-widest" disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Actualizar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
