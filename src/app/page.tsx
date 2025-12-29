// /app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import PassengerRideForm from '@/components/PassengerRideForm';
import RideStatus from '@/components/RideStatus';
import RideHistory from '@/components/RideHistory';
import { useUser, useAuth } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Home() {
  const [rideId, setRideId] = useState<string | null>(null);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    // Check local storage for an ongoing ride
    const savedRideId = localStorage.getItem('activeRideId');
    if (savedRideId) {
      setRideId(savedRideId);
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  const handleNewRideRequest = (newRideId: string) => {
    localStorage.setItem('activeRideId', newRideId);
    setRideId(newRideId);
  }

  const handleRideFinishOrCancel = () => {
    localStorage.removeItem('activeRideId');
    setRideId(null);
  }

  if (isUserLoading || !user) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-md p-4">
      <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">VamO</h1>
      </div>

      <Tabs defaultValue="ride" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ride">Viaje</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="ride" className="mt-4">
          {!rideId ? (
            <PassengerRideForm onConfirm={handleNewRideRequest} />
          ) : (
            <RideStatus rideId={rideId} onCancel={handleRideFinishOrCancel} onFinish={handleRideFinishOrCancel}/>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <RideHistory passengerId={user.uid} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
