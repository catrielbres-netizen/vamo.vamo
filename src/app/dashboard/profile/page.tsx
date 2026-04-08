
'use client';

import React, { useRef, useState } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase/auth/use-user';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotificationToggle } from '@/components/NotificationToggle';
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

    const registrationLink = `https://vamoapp.online?ref=${code}`;
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

  if (loading || !profile || !user) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  const passengerProgress = profile.passengerProgress || { level: 1, monthlyRides: 0 };
  const welcomeBonus = profile.welcomeBonus || { available: true, used: false };
  const averageRating = profile.averageRating?.toFixed(1) ?? 'N/A';

  const LEVEL_DATA = [
    { level: 1, label: "Nuevo", rides: 0, benefit: "Acceso básico a la plataforma" },
    { level: 2, label: "Express", rides: 5, benefit: "Viajes Express desbloqueados" },
    { level: 3, label: "PRO", rides: 15, benefit: "Beneficios de comercios + 10% Off" },
    { level: 4, label: "Premium", rides: 30, benefit: "20% Off Adicional y prioridad" },
  ];

  const currentLevelData = LEVEL_DATA.find(l => l.level === passengerProgress.level) || LEVEL_DATA[0];
  const nextLevelData = LEVEL_DATA.find(l => l.level === passengerProgress.level + 1);
  
  const ridesThisMonth = passengerProgress.monthlyRides || 0;
  const progressToNext = nextLevelData 
    ? Math.min(100, (ridesThisMonth / nextLevelData.rides) * 100)
    : 100;

  return (
    <div className="space-y-6">
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
                    <CardTitle>{profile.name}</CardTitle>
                    <CardDescription>Pasajero en VamO</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
             <ProfileInfoRow icon={<VamoIcon name="mail" />} label="Email" value={profile.email} />
             <ProfileInfoRow icon={<VamoIcon name="phone" />} label="Teléfono" value={profile.phone} />
        </CardContent>
      </Card>
      
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-background to-secondary/20">
        <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <VamoIcon name="award" className="text-primary h-6 w-6"/> Nivel {currentLevelData.label}
                    </CardTitle>
                    <CardDescription>Progreso Mensual • Nivel {passengerProgress.level}</CardDescription>
                </div>
                <div className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 rounded-full border border-primary/20 uppercase tracking-tighter">
                    VamO PRO
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="flex justify-between items-center bg-secondary/30 p-4 rounded-2xl border border-border/50">
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Viajes del mes</p>
                    <p className="text-3xl font-black tabular-nums">{ridesThisMonth}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">BENEFICIO ACTUAL</p>
                    <p className="text-sm font-bold text-primary">{currentLevelData.benefit}</p>
                </div>
            </div>

            {nextLevelData ? (
                <div className="space-y-3">
                    <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <span>Progreso a Nivel {nextLevelData.label}</span>
                        <span>{ridesThisMonth} / {nextLevelData.rides} viajes</span>
                    </div>
                    <Progress value={progressToNext} className="h-2.5" />
                    <p className="text-[10px] text-zinc-500 italic text-center">
                        Completá {nextLevelData.rides - ridesThisMonth} viajes más para desbloquear: <span className="font-bold text-zinc-400">{nextLevelData.benefit}</span>
                    </p>
                </div>
            ) : (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-center">
                    <p className="text-xs font-bold text-primary">¡Nivel Máximo Alcanzado! Disfrutás de todos los beneficios.</p>
                </div>
            )}

            <div className="h-px bg-border/50 w-full" />

            {/* WELCOME BONUS UI */}
            <div className={cn(
                "p-4 rounded-2xl border flex items-center justify-between",
                welcomeBonus.available 
                    ? "bg-amber-500/5 border-amber-500/20" 
                    : "bg-zinc-100 dark:bg-zinc-900 border-border/50 opacity-60"
            )}>
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        welcomeBonus.available ? "bg-amber-500/20 text-amber-500" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                    )}>
                        <VamoIcon name="gift" className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold">Bono de Bienvenida 10%</span>
                        <span className="text-[10px] text-muted-foreground">
                            {welcomeBonus.used 
                                ? "Ya consumiste tu bono inicial." 
                                : "Disponible para tu primer viaje."}
                        </span>
                    </div>
                </div>
                {welcomeBonus.available && (
                    <div className="bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-lg animate-pulse">
                        ACTIVO
                    </div>
                )}
            </div>

            <p className="text-[9px] text-center text-muted-foreground italic">
                * Tu nivel y progreso se reinician automáticamente el primer día de cada mes (Arg).
            </p>
        </CardContent>
      </Card>

      {/* REFERRAL ENGINE UI */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <VamoIcon name="users" className="text-indigo-500 h-6 w-6"/> Invitá y Ganá 5% OFF
                    </CardTitle>
                    <CardDescription>
                        Por cada amigo que haga su primer viaje, ganás un bono.
                    </CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="bg-zinc-900/40 p-5 rounded-[2rem] border border-white/5 flex flex-col items-center gap-4 text-center">
                <div className="flex items-center gap-3">
                    <span className="text-3xl font-black tracking-tight text-white font-mono">
                        {isGeneratingCode ? (
                            <VamoIcon name="loader" className="animate-spin h-6 w-6 text-indigo-400" />
                        ) : (
                            profile.referralCode || 'SIN CÓDIGO'
                        )}
                    </span>
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-indigo-400 hover:bg-indigo-500/10 rounded-full"
                        onClick={handleShare}
                        disabled={isGeneratingCode || !profile.referralCode}
                    >
                        <VamoIcon name="share-2" className="h-5 w-5" />
                    </Button>
                </div>
                {!profile.referralCode && !isGeneratingCode ? (
                    <Button 
                        variant="default" 
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl"
                        onClick={handleGenerateCode}
                    >
                        Generar mi Código
                    </Button>
                ) : (
                    <Button 
                        variant="default" 
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl"
                        onClick={handleShare}
                        disabled={isGeneratingCode || !profile.referralCode}
                    >
                        {isGeneratingCode ? 'Generando...' : 'Invitar Amigos'}
                    </Button>
                )}
            </div>

            <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest px-1">Mis Referidos ({referrals.length})</p>
                
                {loadingReferrals ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full rounded-2xl" />
                        <Skeleton className="h-12 w-full rounded-2xl" />
                    </div>
                ) : referrals.length === 0 ? (
                    <div className="py-8 text-center bg-white/5 rounded-[2rem] border border-dashed border-white/10">
                        <VamoIcon name="users" className="h-8 w-8 text-zinc-700 mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-zinc-500">Aún no tienes amigos referidos.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {referrals.map((ref) => (
                            <div key={ref.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center",
                                        ref.status === 'rewarded' ? "bg-green-500/20 text-green-500" : "bg-zinc-800 text-zinc-500"
                                    )}>
                                        <VamoIcon name="user" className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white">
                                            {ref.referredUserName || `Usuario ${ref.referredId.substring(0,6)}...`}
                                        </span>
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-tighter",
                                            ref.status === 'rewarded' ? "text-green-500" : "text-amber-500"
                                        )}>
                                            {ref.status === 'rewarded' ? '🏆 Premio Acreditado' : '⏳ Pendiente de Viaje'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-zinc-600 font-mono">
                                    {ref.createdAt?.toDate?.().toLocaleDateString() || '...'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 py-4">
                {[
                    { step: "1", text: "Tu amigo usa tu código" },
                    { step: "2", text: "Hace su primer viaje" },
                    { step: "3", text: "¡Recibís 5% OFF!" }
                ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center text-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            {item.step}
                        </div>
                        <p className="text-[8px] font-black uppercase leading-tight text-indigo-300">
                            {item.text}
                        </p>
                    </div>
                ))}
            </div>
        </CardContent>
      </Card>
      
      <Card className="border-primary/20 bg-background/50">
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <VamoIcon name="bell" className="text-primary h-5 w-5" />
                  Notificaciones
              </CardTitle>
              <CardDescription>Asegurate de activarlas para que tu chofer pueda avisarte cuando llegue.</CardDescription>
          </CardHeader>
          <CardContent>
              <NotificationToggle />
          </CardContent>
      </Card>

      {/* EMERGENCY CONTACTS */}
      <Card className="border-red-500/10 dark:border-red-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
                <CardTitle className="flex items-center gap-2">
                    <VamoIcon name="shield-alert" className="text-red-500"/> Contactos de Emergencia
                </CardTitle>
                <CardDescription>
                    Se les notificará cuando uses el botón antipánico. (Máx. 3)
                </CardDescription>
            </div>
            {(profile.emergencyContacts?.length ?? 0) < 3 && (
                <AddContactDialog 
                    onAdd={async (contact) => {
                        const userDocRef = doc(firestore!, 'users', user!.uid);
                        await updateDoc(userDocRef, {
                            emergencyContacts: arrayUnion(contact)
                        });
                        toast({ title: "Contacto agregado" });
                    }} 
                />
            )}
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
            {!profile.emergencyContacts || profile.emergencyContacts.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-3xl border-muted bg-secondary/10 flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center">
                        <VamoIcon name="shield-alert" className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-bold">Sin contactos de emergencia</p>
                        <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">Agregá personas de confianza para mayor seguridad en tus viajes.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {profile.emergencyContacts.map((contact, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 border border-border/40">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                                    <VamoIcon name="user" className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate">{contact.name}</span>
                                    <span className="text-xs text-muted-foreground truncate">{contact.phone}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
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
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                                    onClick={async () => {
                                        const userDocRef = doc(firestore!, 'users', user!.uid);
                                        await updateDoc(userDocRef, {
                                            emergencyContacts: arrayRemove(contact)
                                        });
                                        toast({ title: "Contacto eliminado" });
                                    }}
                                >
                                    <VamoIcon name="trash" className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
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
