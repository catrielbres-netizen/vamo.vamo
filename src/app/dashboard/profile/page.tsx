
'use client';

import React, { useRef, useState } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase/auth/use-user';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';


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

  const vamoPoints = profile.vamoPoints || 0;
  const pointsToNextBonus = 30;
  const progressToBonus = (vamoPoints / pointsToNextBonus) * 100;
  const averageRating = profile.averageRating?.toFixed(1) ?? 'N/A';

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
             <ProfileInfoRow icon={<VamoIcon name="star" />} label="Rating Promedio" value={averageRating} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><VamoIcon name="award" className="text-primary"/> Puntos VamO</CardTitle>
            <CardDescription>Ganá puntos con cada viaje y canjealos por descuentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <div className="text-center">
                <p className="text-4xl font-bold text-primary">{vamoPoints}</p>
                <p className="text-sm text-muted-foreground">puntos acumulados</p>
            </div>
            
            {profile.activeBonus ? (
                 <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-center">
                    <p className="font-semibold text-green-600 dark:text-green-400 flex items-center justify-center gap-2">
                        <VamoIcon name="shield-check" className="w-5 h-5"/> ¡Tenés un bono del 10% activo!
                    </p>
                    <p className="text-xs text-green-500 dark:text-green-500">Se usará en tu próximo viaje.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <Progress value={progressToBonus} />
                    <p className="text-center text-xs text-muted-foreground">
                        Te faltan {Math.max(0, pointsToNextBonus - vamoPoints)} puntos para tu próximo bono de 10% de descuento.
                    </p>
                </div>
            )}
           
            <p className="text-xs text-muted-foreground text-center pt-2">
                Viajes Premium: <span className="font-bold">5 puntos</span>. Viajes Express: <span className="font-bold">2 puntos</span>.
            </p>
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
