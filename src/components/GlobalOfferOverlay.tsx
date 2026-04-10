'use client';

import React, { useEffect, useState } from 'react';
import { useDriverDashboard } from '@/context/DriverRidesProvider';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { playOfferSound, announceNewRide } from '@/lib/sounds';

/**
 * GlobalOfferOverlay
 * Displays a persistent banner when there are pending ride offers.
 * Also handles the initial sound/voice notification for new offers.
 */
export function GlobalOfferOverlay() {
  const router = useRouter();
  const { rides, newRideIds } = useDriverDashboard();
  const [lastNotifiedId, setLastNotifiedId] = useState<string | null>(null);

  // Sound/Voice trigger for new offers
  useEffect(() => {
    if (rides.length > 0) {
      const newestOffer = rides[0];
      if (newestOffer.id !== lastNotifiedId) {
        setLastNotifiedId(newestOffer.id);
        
        // Trigger sound once per new offer
        try {
          playOfferSound();
          if (newestOffer.origin?.address) {
            announceNewRide(newestOffer.origin.address);
          }
        } catch (e) {
          console.error("[GlobalOfferOverlay] Notification error:", e);
        }
      }
    } else {
      setLastNotifiedId(null);
    }
  }, [rides, lastNotifiedId]);

  if (rides.length === 0) return null;

  const count = rides.length;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-[100] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div 
        onClick={() => router.push('/driver/rides')}
        className="bg-indigo-600 dark:bg-indigo-500 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-white/20 cursor-pointer hover:bg-indigo-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <VamoIcon name="car" className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm">¡Nuevo viaje disponible!</p>
            <p className="text-xs text-white/80">
              {count === 1 
                ? "Tenés 1 solicitud pendiente." 
                : `Tenés ${count} solicitudes pendientes.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-8 px-2">
             VER <VamoIcon name="chevron-right" className="ml-1 w-4 h-4" />
           </Button>
        </div>
      </div>
    </div>
  );
}
