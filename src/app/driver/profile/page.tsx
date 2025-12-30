// src/app/driver/profile/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc, serverTimestamp } from 'firebase/firestore';
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

  const userProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const handleProfileSave = (profileData: Partial<UserProfile & { cedulaUploaded?: boolean, seguroUploaded?: boolean, dniUploaded?: boolean }>) => {
    if (!userProfileRef || isSaving) return;
    setIsSaving(true);

    const dataToSave: Partial<UserProfile> = {
        ...profileData,
        updatedAt: serverTimestamp(),
    };

    let shouldRedirect = false;

    // Logic for creating or updating the profile
    if (!userProfile) { // If profile doesn't exist, create it.
        dataToSave.createdAt = serverTimestamp();
        dataToSave.vamoPoints = 0;
        dataToSave.ridesCompleted = 0;
        dataToSave.averageRating = null;
        dataToSave.activeBonus = false;
        dataToSave.isDriver = profileData.isDriver || false;
        if (profileData.isDriver) {
          dataToSave.vehicleVerificationStatus = 'pending_review';
          shouldRedirect = true;
        } else {
          dataToSave.vehicleVerificationStatus = 'unverified';
        }
    } else { // If profile exists, update it.
        if (profileData.isDriver && userProfile.vehicleVerificationStatus === 'unverified') {
           dataToSave.vehicleVerificationStatus = 'pending_review';
           shouldRedirect = true;
        }
    }

    setDocumentNonBlocking(userProfileRef, dataToSave, { merge: true });

    toast({
        title: '¡Perfil guardado!',
        description: 'Tus datos han sido actualizados.',
    });

    if (shouldRedirect) {
       router.push('/driver/rides');
    }
    
    setIsSaving(false);
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
         onCancel={() => {}} // No cancel button needed here, but prop is required
       />
    </Card>
  );
}
