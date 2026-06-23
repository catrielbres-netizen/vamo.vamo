
'use client';

import React, { useRef, useState } from 'react';
import { useUser, useFirestore, useFirebaseApp, useFirebase } from '@/firebase/auth/use-user';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MercadoPagoLinkCard } from '@/components/MercadoPagoLinkCard';
import { featureFlags } from '@/config/features';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotificationToggle } from '@/components/NotificationToggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


const ProfileInfoRow = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number | null | undefined }) => (
    <div className="flex items-start gap-4 text-sm">
        <div className="text-muted-foreground w-6 pt-0.5">{icon}</div>
        <div>
            <p className="text-muted-foreground">{label}</p>
            <p className="font-medium">{value || 'No especificado'}</p>
        </div>
    </div>
);


export default function ProfilePage() {
  const { profile, user, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const firebaseApp = useFirebaseApp();
  const firestore = useFirestore();
  const { toast } = useToast();

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
            toast({ title: "Código generado", description: "Ya podés empezar a invitar amigos." });
        }
    } catch (error: any) {
        console.error("Error generating code:", error);
        toast({ 
            variant: 'destructive', 
            title: "Error al generar código", 
            description: "No pudimos generar tu código en este momento. Reintentá más tarde." 
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

    const baseUrl = 'https://www.vamoapp.com.ar';
    const registrationLink = `${baseUrl}/r/${code}`;
    const shareText = `Sumate a VamO y ganá beneficios 🚀\nRegistrate desde mi link:\n${registrationLink}`;
    const shareData = {
        title: 'VamO 🚀',
        text: shareText,
        // No url field if we include it in text for better cross-platform consistency
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
            toast({ title: "Código copiado", description: "Pegalo y compartilo con tus amigos." });
        })
        .catch((err) => {
            console.error('Clipboard copy failed', err);
            toast({ 
                variant: 'destructive', 
                title: "Error al copiar", 
                description: "No se pudo copiar el código automáticamente. Seleccionalo y copialo manualmente." 
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
    // [VamO PRO] Unified storage path for profile photos
    const storageRef = ref(storage, `profile_photos/${user.uid}/avatar.jpg`);

    setIsUploading(true);
    try {
      const uploadResult = await uploadBytes(storageRef, file, { contentType: file.type });
      const downloadURL = await getDownloadURL(uploadResult.ref);

      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, {
        photoURL: downloadURL,
        avatarUrl: downloadURL, // [VamO] Redundancy for different modules
        photoUpdatedAt: new Date()
      });

      toast({ title: "Foto de perfil actualizada", description: "Tu nueva foto ya es visible." });
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast({ variant: 'destructive', title: "Error al subir la foto", description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  if (loading || !profile || !user) {
    return (
        <div className="w-full max-w-lg mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
            <div className="mb-6 px-1 space-y-2">
                <div className="h-10 w-48 bg-zinc-900 animate-pulse rounded-xl" />
                <div className="h-4 w-64 bg-zinc-900 animate-pulse rounded-lg" />
            </div>

            <div className="h-14 w-full bg-zinc-900/50 animate-pulse rounded-2xl" />

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 flex flex-col items-center gap-6">
                <div className="h-28 w-28 rounded-full bg-zinc-800 animate-pulse" />
                <div className="space-y-2 flex flex-col items-center">
                    <div className="h-8 w-40 bg-zinc-800 animate-pulse rounded-xl" />
                    <div className="h-4 w-32 bg-zinc-800 animate-pulse rounded-lg" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="h-16 w-full bg-zinc-900/50 animate-pulse rounded-2xl" />
                <div className="h-16 w-full bg-zinc-900/50 animate-pulse rounded-2xl" />
            </div>
        </div>
    );
  }

  // [VamO PRO v2.0] Weekly Progression Logic
  const prog = (profile.passengerProgress as any) || {};
  const ridesThisWeek = prog.ridesThisWeek || 0;
  const currentLevel = prog.currentLevel || 'none';
  
  const WEEKLY_GOALS = [
    { id: 'none', label: "Principiante", rides: 0, benefit: "Sin descuento activo" },
    { id: 'unlocked_10', label: "Express Silver", rides: 5, benefit: "10% Off en todos tus viajes" },
    { id: 'unlocked_15', label: "Express Gold", rides: 10, benefit: "15% Off en todos tus viajes" },
  ];

  const currentGoalIndex = WEEKLY_GOALS.findIndex(g => g.id === currentLevel);
  const currentGoal = WEEKLY_GOALS[currentGoalIndex >= 0 ? currentGoalIndex : 0];
  const nextGoal = WEEKLY_GOALS[currentGoalIndex + 1] || null;
  
  const progressToNext = nextGoal 
    ? Math.min(100, (ridesThisWeek / nextGoal.rides) * 100)
    : 100;

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-1000 fill-mode-both">
      <div className="mb-6 px-1">
        <h1 className="text-3xl font-black tracking-tight mb-2">Mi Perfil</h1>
        <p className="text-muted-foreground text-sm">Gestiona tus datos, progresos y seguridad.</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full flex h-auto sm:h-14 bg-zinc-900/50 rounded-2xl p-1 gap-1 mb-6 overflow-x-auto custom-scrollbar">
          <TabsTrigger value="general" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">Perfil</TabsTrigger>
          <TabsTrigger value="pro" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">PRO</TabsTrigger>
          <TabsTrigger value="pagos" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 relative whitespace-nowrap flex-1">
            Pagos
            {!profile?.mpLinked && featureFlags.mercadoPagoRequiredEnabled && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="identity" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">ID</TabsTrigger>
          <TabsTrigger value="referral" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">Refs</TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">SOS</TabsTrigger>
          <TabsTrigger value="theme" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 px-3 sm:py-0 whitespace-nowrap flex-1">Diseño</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-[2rem] border border-white/5 bg-[#12141D] shadow-2xl overflow-hidden">
                <div className="relative p-8 flex flex-col items-center gap-5 bg-gradient-to-b from-white/[0.02] to-transparent">
                    <div className="relative">
                        <Avatar className="h-28 w-28 border-2 border-white/10 shadow-2xl bg-zinc-900">
                            <AvatarImage src={profile.photoURL || undefined} alt={profile.name} className="object-cover" />
                            <AvatarFallback className="text-4xl font-bold text-white bg-zinc-800">
                                {profile.name?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <Button
                            size="icon"
                            className="absolute bottom-0 right-0 rounded-full h-10 w-10 bg-indigo-600 hover:bg-indigo-500 shadow-xl border-[3px] border-[#12141D] transition-transform hover:scale-105"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? <VamoIcon name="loader" className="animate-spin h-4 w-4 text-white" /> : <VamoIcon name="pencil" className="h-4 w-4 text-white" />}
                        </Button>
                        <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/png, image/jpeg" />
                    </div>
                    
                    <div className="text-center space-y-2">
                        <div className="flex items-center justify-center gap-2">
                            <h2 className="text-2xl font-black text-white tracking-tight">{profile.name} {profile.surname || ''}</h2>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-400">
                                Pasajero VamO
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-4 p-4 bg-[#1A1D27] rounded-2xl border border-white/5">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 shrink-0">
                                <VamoIcon name="mail" className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Correo Electrónico</p>
                                <p className="text-sm font-bold text-zinc-200 truncate">{profile.email}</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4 p-4 bg-[#1A1D27] rounded-2xl border border-white/5">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 shrink-0">
                                <VamoIcon name="phone" className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">WhatsApp / Teléfono</p>
                                <p className="text-sm font-bold text-zinc-200 truncate">{profile.phone || 'No especificado'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <Button 
                    variant="outline" 
                    className="w-full h-14 rounded-2xl font-bold border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300"
                    onClick={async () => {
                        if (!user || !firestore) return;
                        try {
                            const userRef = doc(firestore, 'users', user.uid);
                            await updateDoc(userRef, { hasSeenTutorial: false });
                            toast({ title: "Tutorial reiniciado", description: "Volviendo al inicio..." });
                            router.push('/dashboard/ride');
                        } catch (e) {
                            toast({ variant: 'destructive', title: "Error", description: "No se pudo reiniciar el tutorial." });
                        }
                    }}
                >
                    <VamoIcon name="help-circle" className="mr-2 h-4 w-4" /> Ver tutorial de nuevo
                </Button>

                <Button variant="ghost" className="w-full text-zinc-500 hover:text-white font-bold h-12" onClick={handleLogout}>
                    Cerrar Sesión Activa
                </Button>
            </div>
        </TabsContent>

        <TabsContent value="pro" className="space-y-4 animate-in fade-in duration-300">
            <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-zinc-900 to-indigo-900/10 shadow-xl">
                <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-2xl font-black">
                                <VamoIcon name="award" className="text-primary h-7 w-7"/> {currentGoal.label}
                            </CardTitle>
                            <CardDescription className="text-sm mt-1">Beneficios Semanales</CardDescription>
                        </div>
                        <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1.5 rounded-full border border-primary/20 uppercase tracking-widest shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                            VamO PRO
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex justify-between items-center bg-zinc-950/50 p-5 rounded-2xl border border-white/5">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Viajes esta semana</p>
                            <p className="text-4xl font-black tabular-nums text-white">{ridesThisWeek}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-muted-foreground font-black mb-1 uppercase tracking-widest">NIVEL ACTUAL</p>
                            <p className="text-sm font-bold text-primary max-w-[150px] leading-tight italic">{currentGoal.label}</p>
                        </div>
                    </div>

                    {nextGoal ? (
                        <div className="space-y-3 bg-zinc-900/50 p-5 rounded-2xl border border-white/5">
                            <div className="flex justify-between items-end text-xs font-black uppercase tracking-widest text-zinc-400">
                                <span>Rumbo a {nextGoal.label}</span>
                                <span className="text-white">{ridesThisWeek} / {nextGoal.rides} viajes</span>
                            </div>
                            <Progress value={progressToNext} className="h-3 rounded-full bg-zinc-800" />
                            <p className="text-xs text-zinc-500 font-medium pt-2">
                                Completá {nextGoal.rides - ridesThisWeek} viajes más para desbloquear: <span className="font-bold text-white block mt-1">{nextGoal.benefit}</span>
                            </p>
                        </div>
                    ) : (
                        <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl text-center">
                            <p className="text-sm font-black uppercase tracking-widest text-primary">¡Nivel Máximo Alcanzado!</p>
                            <p className="text-[10px] font-bold text-primary/60 uppercase mt-1">{currentGoal.benefit}</p>
                        </div>
                    )}

                    {/* [VamO PRO v2.1] Subsidy Control Visualization */}
                    <div className="space-y-3 bg-indigo-950/20 p-5 rounded-2xl border border-indigo-500/20">
                        <div className="flex justify-between items-end text-xs font-black uppercase tracking-widest text-indigo-300/70">
                            <span>Control de Subsidio Semanal</span>
                            <span className="text-indigo-200">${(prog.weeklySubsidySpent || 0).toLocaleString()} / $5,000</span>
                        </div>
                        <Progress 
                            value={Math.min(100, ((prog.weeklySubsidySpent || 0) / 5000) * 100)} 
                            className="h-2 rounded-full bg-indigo-900/30" 
                        />
                        <p className="text-[10px] text-indigo-300/60 font-medium pt-1 italic">
                            El beneficio Express aplica hasta un tope de $5,000 semanales por usuario.
                        </p>
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground/60 italic font-medium px-4">
                        * Tu nivel y progreso se calculan según tus viajes finalizados esta semana y se reinician automáticamente cada lunes.
                    </p>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="pagos" className="space-y-4 animate-in fade-in duration-300">
            <div className="mb-2 px-1">
                <h2 className="text-xl font-black text-white">Métodos de Pago</h2>
                <p className="text-xs text-zinc-500 mt-1">Vinculá tu cuenta de Mercado Pago para habilitar pagos digitales y validar tu identidad.</p>
            </div>
            <MercadoPagoLinkCard
                mpAccountStatus={profile?.mpAccountStatus}
                mpLinkedAt={(profile as any)?.mpLinkedAt}
            />
            {featureFlags.mercadoPagoRequiredEnabled && !profile?.mpLinked && (
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                    <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1">Requerido para viajar</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        Para solicitar viajes en VamO necesitás vincular tu cuenta de Mercado Pago. Esto nos permite validar tu identidad de forma segura.
                    </p>
                </div>
            )}
        </TabsContent>

        <TabsContent value="identity" className="space-y-4 animate-in fade-in duration-300">
            <Card className={cn(
                "rounded-3xl border-zinc-800 bg-zinc-900/40 shadow-xl overflow-hidden",
                profile.identityStatus === 'approved' ? "border-green-500/20 bg-green-500/5" : ""
            )}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl font-black">
                                <VamoIcon name="shield-check" className={cn("h-6 w-6", profile.identityStatus === 'approved' ? "text-green-500" : "text-indigo-400")}/> Verificación
                            </CardTitle>
                            <CardDescription>Valida tu identidad para reclamos y beneficios</CardDescription>
                        </div>
                        <Badge variant={
                            profile.identityStatus === 'approved' ? 'default' : 
                            profile.identityStatus === 'pending' ? 'secondary' : 'destructive'
                        } className="uppercase font-black text-[9px] px-3 py-1">
                            {profile.identityStatus === 'approved' ? 'Verificado' : 
                             profile.identityStatus === 'pending' ? 'En Revisión' : 
                             profile.identityStatus === 'rejected' ? 'Rechazado' : 'No Verificado'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {profile.identityStatus === 'approved' ? (
                        <div className="p-6 bg-green-500/10 rounded-2xl border border-green-500/20 text-center">
                            <VamoIcon name="check-circle" className="h-12 w-12 text-green-500 mx-auto mb-3" />
                            <p className="text-sm font-bold text-green-400">Tu identidad ha sido verificada con éxito.</p>
                            <p className="text-[10px] text-green-500/60 uppercase mt-2 font-black tracking-widest">Cuenta de confianza</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <IdentityDocUploader 
                                    label="DNI Frente" 
                                    docId="dniFront"
                                    userId={user.uid}
                                    currentUrl={profile.identityDocuments?.dniFront}
                                    status={profile.identityStatus}
                                />
                                <IdentityDocUploader 
                                    label="DNI Dorso" 
                                    docId="dniBack"
                                    userId={user.uid}
                                    currentUrl={profile.identityDocuments?.dniBack}
                                    status={profile.identityStatus}
                                />
                                <IdentityDocUploader 
                                    label="Selfie con DNI" 
                                    docId="selfie"
                                    userId={user.uid}
                                    currentUrl={profile.identityDocuments?.selfie}
                                    status={profile.identityStatus}
                                />
                            </div>

                            {profile.identityNote && (
                                <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                                    <p className="text-[10px] font-black uppercase text-red-400 mb-1">Observación:</p>
                                    <p className="text-xs text-white italic">"{profile.identityNote}"</p>
                                </div>
                            )}

                            {profile.identityStatus !== 'pending' && (
                                <>
                                    <Button 
                                        className="w-full h-14 rounded-2xl font-black uppercase tracking-widest"
                                        disabled={!profile.identityDocuments?.dniFront || !profile.identityDocuments?.dniBack || !profile.identityDocuments?.selfie}
                                        onClick={async () => {
                                            try {
                                                const userRef = doc(firestore!, 'users', user.uid);
                                                await updateDoc(userRef, { 
                                                    identityStatus: 'pending',
                                                    identitySubmittedAt: new Date()
                                                });
                                                toast({ title: "Solicitud enviada", description: "Revisaremos tu documentación en breve." });
                                            } catch (e) {
                                                toast({ variant: 'destructive', title: "Error", description: "No se pudo enviar la solicitud." });
                                            }
                                        }}
                                    >
                                        Enviar para Revisión
                                    </Button>
                                    <div className="text-center mt-6 pt-2 border-t border-white/5">
                                        <p className="text-xs text-muted-foreground mb-2">¿Tenés problemas para subir las fotos?</p>
                                        <Button 
                                            variant="outline" 
                                            className="w-full h-12 rounded-xl text-xs font-bold border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/10"
                                            onClick={() => window.location.href = `mailto:documentos@vamoapp.com.ar?subject=Documentos%20Pasajero%20-%20${profile.name}%20(${user.uid})&body=Hola%20equipo%20de%20VamO,%0A%0AAdjunto%20mis%20documentos%20porque%20tuve%20problemas%20para%20subirlos%20desde%20la%20app.%0A%0AGracias.`}
                                        >
                                            <VamoIcon name="mail" className="w-4 h-4 mr-2" /> Enviar por Email
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="referral" className="space-y-4 animate-in fade-in duration-300">
            <Card className="rounded-3xl border-indigo-500/20 bg-gradient-to-b from-indigo-500/10 to-zinc-900/40 shadow-xl overflow-hidden">
                <CardContent className="p-0">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-2xl font-black flex items-center gap-2 text-white">
                                <VamoIcon name="gift" className="text-indigo-400 h-6 w-6"/> Invitá y Ganá
                            </h2>
                            <p className="text-sm text-zinc-400">Compartí tu código. Por cada amigo que haga su primer viaje, ganás bonos de descuento directo.</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="bg-zinc-950 p-6 rounded-3xl border border-white/5 flex flex-col items-center gap-4 text-center shadow-inner">
                            <div className="flex items-center gap-4">
                                <span className="text-4xl font-black tracking-tight text-indigo-300 font-mono">
                                    {isGeneratingCode ? <VamoIcon name="loader" className="animate-spin h-8 w-8" /> : (profile.referralCode || 'SIN CÓDIGO')}
                                </span>
                                <Button size="icon" variant="secondary" className="h-12 w-12 rounded-full" onClick={handleShare} disabled={isGeneratingCode || !profile.referralCode}>
                                    <VamoIcon name="share-2" className="h-5 w-5" />
                                </Button>
                            </div>
                            
                            {!profile.referralCode && !isGeneratingCode ? (
                                <Button className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl" onClick={handleGenerateCode}>
                                    Generar mi Código
                                </Button>
                            ) : null}
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xs text-muted-foreground font-black uppercase tracking-widest px-2">Historial de Referidos ({referrals.length})</h3>
                            
                            {loadingReferrals ? (
                                <div className="space-y-3"><Skeleton className="h-16 w-full rounded-2xl" /><Skeleton className="h-16 w-full rounded-2xl" /></div>
                            ) : referrals.length === 0 ? (
                                <div className="py-10 text-center bg-zinc-900/30 rounded-3xl border border-dashed border-white/10">
                                    <VamoIcon name="users" className="h-10 w-10 text-zinc-700 mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-bold text-zinc-500">Nadie ha usado tu código aún.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {referrals.map((ref) => (
                                        <div key={ref.id} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-2xl border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-white">{ref.referredUserName || `Usuario anónimo`}</span>
                                                <span className={cn("text-[10px] font-black uppercase tracking-widest mt-1", ref.status === 'completed' || ref.status === 'rewarded' ? "text-green-400" : "text-amber-400")}>
                                                    {ref.status === 'completed' || ref.status === 'rewarded' ? '🏆 Acreditado' : '⏳ Pendiente'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-zinc-600 font-medium">
                                                {ref.createdAt?.toDate?.().toLocaleDateString() || '--'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 animate-in fade-in duration-300">
            <Card className="rounded-3xl border-red-500/20 bg-gradient-to-b from-red-500/10 to-zinc-900/40 shadow-xl overflow-hidden">
                <CardHeader className="p-6 border-b border-white/5 bg-zinc-900/20">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-2xl font-black flex items-center gap-2 text-white">
                            <VamoIcon name="shield-alert" className="text-red-500 h-6 w-6"/> Emergencias
                        </CardTitle>
                        {(profile.emergencyContacts?.length ?? 0) < 3 && (
                            <AddContactDialog onAdd={async (contact) => {
                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                await updateDoc(userDocRef, { emergencyContacts: arrayUnion(contact) });
                                toast({ title: "Contacto agregado" });
                            }} />
                        )}
                    </div>
                    <CardDescription className="text-sm text-zinc-400 mt-2">
                        Si accionás el botón de pánico en un viaje, notificaremos inmediatamente a estos contactos con tu ubicación en vivo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    {!profile.emergencyContacts || profile.emergencyContacts.length === 0 ? (
                        <div className="text-center py-10 bg-zinc-900/30 rounded-3xl border border-dashed border-red-500/20">
                            <VamoIcon name="shield-off" className="h-10 w-10 text-red-900/50 mx-auto mb-3" />
                            <p className="text-sm font-bold text-red-400/80">Sin contactos vinculados.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {profile.emergencyContacts.map((contact, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-base font-black text-white">{contact.name}</span>
                                        <span className="text-sm text-zinc-400">{contact.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <EditContactDialog 
                                            contact={contact}
                                            onUpdate={async (updatedContact) => {
                                                const newContacts = [...(profile.emergencyContacts || [])];
                                                newContacts[idx] = updatedContact;
                                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                                await updateDoc(userDocRef, { emergencyContacts: newContacts });
                                                toast({ title: "Actualizado" });
                                            }}
                                        />
                                        <Button variant="ghost" size="icon" className="h-10 w-10 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                                            onClick={async () => {
                                                const userDocRef = doc(firestore!, 'users', user!.uid);
                                                await updateDoc(userDocRef, { emergencyContacts: arrayRemove(contact) });
                                                toast({ title: "Eliminado" });
                                            }}>
                                            <VamoIcon name="trash" className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="theme" className="space-y-4 animate-in fade-in duration-300">
            <ThemeCustomizer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IdentityDocUploader({ label, docId, userId, currentUrl, status }: { label: string, docId: string, userId: string, currentUrl?: string, status?: string }) {
    const { app: firebaseApp, firestore, functions, storage } = useFirebase();
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !firebaseApp || !firestore) return;
        const file = e.target.files[0];
        const storage = getStorage(firebaseApp);
        const storageRef = ref(storage, `passenger_identity/${userId}/${docId}_${Date.now()}.jpg`);

        setIsUploading(true);
        try {
            // 1. Upload to Storage
            const uploadResult = await uploadBytes(storageRef, file, { contentType: file.type });
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // 2. Register Document via Cloud Function
            const submitDoc = httpsCallable(functions, 'submitDocumentV1');
            await submitDoc({
                ownerUid: userId,
                docType: docId,
                category: 'identity',
                storagePath: uploadResult.ref.fullPath,
                downloadURL: downloadURL,
                contentType: file.type,
                originalFilename: file.name
            });

            // 3. Update Legacy Field (For current UI compatibility)
            const userRef = doc(firestore, 'users', userId);
            await updateDoc(userRef, {
                [`identityDocuments.${docId}`]: downloadURL,
                identityStatus: 'unverified' 
            });

            toast({ title: "Documento subido", description: `${label} se guardó correctamente.` });
        } catch (error: any) {
            console.error("[UPLOAD_ERROR]", error);
            toast({ variant: 'destructive', title: "Error al subir", description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div 
            className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-2xl border border-white/5 hover:bg-zinc-950/80 transition-colors"
        >
            <div 
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => (status !== 'pending' && status !== 'approved') && inputRef.current?.click()}
            >
                <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110",
                    currentUrl ? "bg-green-500/20 text-green-500" : "bg-indigo-500/20 text-indigo-400"
                )}>
                    {isUploading ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : (currentUrl ? <VamoIcon name="check" className="h-5 w-5" /> : <VamoIcon name="camera" className="h-5 w-5" />)}
                </div>
                <div>
                    <p className="text-xs font-bold text-white">{label}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{currentUrl ? 'Cargado' : 'Requerido'}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {currentUrl && (
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-indigo-400 rounded-xl hover:bg-indigo-500/10"
                        onClick={() => window.open(currentUrl, '_blank')}
                    >
                        <VamoIcon name="eye" className="h-5 w-5" />
                    </Button>
                )}
                {status !== 'pending' && status !== 'approved' && (
                    <>
                        <input type="file" ref={inputRef} onChange={handleUpload} className="hidden" accept="image/*" />
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-10 rounded-xl font-black text-[10px] uppercase tracking-widest"
                            onClick={() => inputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {currentUrl ? 'Cambiar' : 'Subir'}
                        </Button>
                    </>
                )}
            </div>
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
            <DialogContent className="rounded-3xl max-w-[95vw] sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">Nuevo contacto</DialogTitle>
                    <DialogDescription>
                        Ingresá los datos de tu contacto de confianza.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Nombre</Label>
                        <Input 
                            id="name" 
                            placeholder="Ej. Mamá, Juan" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="rounded-xl h-12"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="phone">WhatsApp / Teléfono</Label>
                        <Input 
                            id="phone" 
                            placeholder="+54 9 11 ..." 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            className="rounded-xl h-12"
                            required
                        />
                    </div>
                    <DialogFooter className="pt-2">
                        <Button type="submit" className="w-full h-12 rounded-xl font-bold" disabled={isSaving}>
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
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-secondary rounded-xl">
                    <VamoIcon name="pencil" className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-[95vw] sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">Editar contacto</DialogTitle>
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
                            className="rounded-xl h-12"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-phone">WhatsApp / Teléfono</Label>
                        <Input 
                            id="edit-phone" 
                            value={phone} 
                            onChange={(e) => setPhone(e.target.value)} 
                            className="rounded-xl h-12"
                            required
                        />
                    </div>
                    <DialogFooter className="pt-2">
                        <Button type="submit" className="w-full h-12 rounded-xl font-bold" disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Actualizar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
