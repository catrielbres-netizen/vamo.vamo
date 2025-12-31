// src/app/driver/profile/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/lib/types';
import ProfileForm from '@/components/ProfileForm';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/icons';
import { useRouter } from 'next/navigation';

export default function DriverProfilePage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  // State for document uploads, lifted up from the form
  const [cedulaUploaded, setCedulaUploaded] = useState(false);
  const [seguroUploaded, setSeguroUploaded] = useState(false);
  const [dniUploaded, setDniUploaded] = useState(false);

  const userProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const handleProfileSave = async (profileData: Partial<UserProfile>) => {
    if (!userProfileRef || isSaving) return;
    
    setIsSaving(true);
    
    const dataToSave: Partial<UserProfile> = {
        name: profileData.name,
        carModelYear: profileData.carModelYear,
        isDriver: profileData.isDriver,
        photoURL: profileData.photoURL,
        updatedAt: serverTimestamp(),
    };

    let shouldRedirect = false;

    if (!userProfile) { // Logic for CREATING a new profile
        dataToSave.createdAt = serverTimestamp();
        dataToSave.vamoPoints = 0;
        dataToSave.ridesCompleted = 0;
        dataToSave.averageRating = null;
        dataToSave.activeBonus = false;
        dataToSave.vehicleVerificationStatus = profileData.isDriver ? 'pending_review' : 'unverified';
        if (profileData.isDriver) shouldRedirect = true;
    } else { // Logic for UPDATING an existing profile
        if (profileData.isDriver && userProfile.vehicleVerificationStatus === 'unverified') {
           dataToSave.vehicleVerificationStatus = 'pending_review';
           shouldRedirect = true;
        }
    }
    
    try {
        await setDoc(userProfileRef, dataToSave, { merge: true });

        toast({
            title: '¡Perfil guardado!',
            description: 'Tus datos han sido actualizados.',
        });

        if (shouldRedirect) {
           router.push('/driver/rides');
        }
    } catch (error) {
        console.error("Error saving profile: ", error);
        toast({
            variant: 'destructive',
            title: 'Error al guardar',
            description: 'No se pudo guardar tu perfil. Intentá de nuevo.',
        });
    } finally {
        setIsSaving(false);
    }
  };


  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4 text-muted-foreground">Cargando perfil...</p>
      </div>
    );
  }

  return (
    <Card>
       <CardHeader className="text-center">
          <CardTitle>Mi Perfil</CardTitle>
          <CardDescription>Mantené tus datos actualizados.</CardDescription>
        </CardHeader>
       <ProfileForm 
         userProfile={userProfile}
         onSave={handleProfileSave}
         onCancel={() => {}} // No cancel button needed here
         cedulaUploaded={cedulaUploaded}
         seguroUploaded={seguroUploaded}
         dniUploaded={dniUploaded}
         setCedulaUploaded={setCedulaUploaded}
         setSeguroUploaded={setSeguroUploaded}
         setDniUploaded={setDniUploaded}
       />
    </Card>
  );
}
