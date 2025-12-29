// /app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import PassengerRideForm from '@/components/PassengerRideForm';
import RideStatus from '@/components/RideStatus';
import { useUser, useAuth, initiateAnonymousSignIn } from '@/firebase';

export default function Home() {
  const [rideId, setRideId] = useState<string | null>(null);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8 text-primary mr-2"
        >
          <path d="M4 6L8 18L12 6L16 18L20 6" />
        </svg>
        <h1 className="text-3xl font-bold text-center">VamO</h1>
      </div>

      {!rideId ? (
        <PassengerRideForm onConfirm={setRideId} />
      ) : (
        <RideStatus rideId={rideId} />
      )}
    </main>
  );
}
