
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleServiceToggle = async () => {
    if (!firestore || !user) return;
    
    const newServices = { 
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
  
  const ridesCompleted = profile.stats?.ridesCompleted ?? 0;
  const PROMO_RIDE_THRESHOLD = 10;
  const isInPromoPeriod = profile.promoCreditGranted && ridesCompleted < PROMO_RIDE_THRESHOLD;

  const isPremiumTier = profile.serviceTier === 'premium';

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
                <div>
                    <p className="text-xs text-muted-foreground">Nivel</p>
                    <Badge variant="outline" className={cn("capitalize", levelBadgeStyle)}>{profile.driverLevel || 'Bronce'}</Badge>
                </div>
            </div>
            <Separator />
            <ProfileInfoRow icon={<VamoIcon name="mail" />} label="Email" value={profile.email} />
            <ProfileInfoRow icon={<VamoIcon name="phone" />} label="Teléfono" value={profile.phone} />
            <ProfileInfoRow icon={<VamoIcon name="star" />} label="Rating Promedio" value={averageRating} />
             <ProfileInfoRow icon={<VamoIcon name="award" />} label="Puntos de Recompensa" value={profile.rewardPoints || 0} />
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
