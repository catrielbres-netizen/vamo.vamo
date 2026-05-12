'use client';

import React from 'react';
import RideReceiptClient from '@/app/dashboard/history/[rideId]/RideReceiptClient';
import { VamoIcon } from '@/components/VamoIcon';

interface PageProps {
  params: { rideId: string };
}

export default function DriverRideReceiptPage({ params }: { params: PageProps['params'] }) {
  const { rideId } = params;

  if (!rideId) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center">
            <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
            <p className="mt-4 text-muted-foreground">Cargando comprobante...</p>
        </div>
    );
  }
  
  // Note: We use the same Client component, we will need to adjust its back navigation logic
  // to be context-aware if it doesn't already allow it.
  return <RideReceiptClient rideId={rideId} />;
}
