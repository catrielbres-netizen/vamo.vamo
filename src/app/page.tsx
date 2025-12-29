// /app/page.tsx
"use client";

import { useState } from "react";
import PassengerRideForm from "@/components/PassengerRideForm";
import RideStatus from "@/components/RideStatus";

export default function Home() {
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [currentRideData, setCurrentRideData] = useState(null);

  function handleConfirmRide(data: any) {
    setCurrentRideData(data);
    setRideStatus("Buscando conductor...");

    setTimeout(() => setRideStatus("Conductor encontrado"), 2000);
    setTimeout(() => setRideStatus("El conductor está en camino"), 4000);
    setTimeout(() => setRideStatus("El conductor ha llegado"), 6000);
    setTimeout(() => setRideStatus("Viaje en curso"), 8000);
    setTimeout(() => setRideStatus("Viaje finalizado"), 12000);
    setTimeout(() => {
      setRideStatus(null);
      setCurrentRideData(null);
    }, 14000);
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

      {!rideStatus ? (
        <PassengerRideForm onConfirm={handleConfirmRide} />
      ) : (
        <RideStatus status={rideStatus} rideData={currentRideData} />
      )}
    </main>
  );
}
