'use client';

import { useState, useEffect } from 'react';
import { PassengerHeader } from '@/components/PassengerHeader';
import { TripCard } from '@/components/TripCard';
import { ServiceSelector } from '@/components/ServiceSelector';
import { PriceDisplay } from '@/components/PriceDisplay';
import { DriverInfo } from '@/components/DriverInfo';
import { TripTimers } from '@/components/TripTimers';
import { MainActionButton } from '@/components/MainActionButton';
import { useUser, useAuth } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/icons';
import RideHistory from '@/components/RideHistory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


// Mock data - to be replaced with Firestore data
const mockDriver = {
    name: 'Juan Pérez',
    car: 'Toyota Corolla',
    plate: 'AB 123 CD',
    rating: '4.9',
};


export default function Home() {
  const [rideId, setRideId] = useState<string | null>(null);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  
  // 🔥 después estos datos vienen de Firestore
  const status = 'idle';

  useEffect(() => {
    if (!auth) return;
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);


  if (isUserLoading || !user) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando...</p>
      </main>
    );
  }

  return (
     <div className="max-w-md mx-auto">
      <PassengerHeader userName="Catriel" location="Ubicación actual" />
      <TripCard status={status} origin="Actual" destination="Destino" />
      <ServiceSelector value="premium" onChange={() => {}} />
      <PriceDisplay price={5400} isNight={false} />
      <DriverInfo driver={null} />
      <TripTimers waitMinutes={0} waitCost={0} />
      <MainActionButton status={status} onClick={() => {}} />
    </div>
  );
}
