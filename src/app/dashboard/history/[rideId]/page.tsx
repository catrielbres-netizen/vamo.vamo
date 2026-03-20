'use client';

import React from 'react';
import RideReceiptClient from './RideReceiptClient';
import { useParams } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';

// This page is a client-side wrapper to correctly handle dynamic routes
// within a client-side layout structure (e.g., /dashboard).
export default function PassengerRideReceiptPage() {
  const params = useParams();
  const rideId = Array.isArray(params.rideId) ? params.rideId[0] : params.rideId;

  if (!rideId) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center">
            <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
            <p className="mt-4 text-muted-foreground">Cargando recibo...</p>
        </div>
    );
  }
  
  return <RideReceiptClient rideId={rideId} />;
}
