// /app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import PassengerRideForm from '@/components/PassengerRideForm';
import RideStatus from '@/components/RideStatus';
import { useUser, useAuth } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/icons';

export default function Home() {
  const [rideId, setRideId] = useState<string | null>(null);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!auth) return;
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  const handleNewRide = () => {
    setRideId(null);
  }

  if (isUserLoading) {
    return (
      <main className="container mx-auto max-w-md p-4">
        <div className="flex justify-center items-center mb-6">
          <h1 className="text-3xl font-bold text-center">VamO</h1>
        </div>
        <p className="text-center">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-md p-4">
      <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">VamO</h1>
      </div>

      {!rideId ? (
        <PassengerRideForm onConfirm={setRideId} />
      ) : (
        <RideStatus rideId={rideId} onCancel={handleNewRide}/>
      )}
    </main>
  );
}
