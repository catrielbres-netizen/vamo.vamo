'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import { EnrichedRideOffer } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';
import { playOfferSound, announceNewRide, startNextelLoop, stopNextelLoop } from '@/lib/sounds';
import { cn } from '@/lib/utils';

/**
 * GlobalOfferOverlay
 * Displays a persistent banner when there are pending ride offers.
 * Handles sound/voice notifications and rhythmic Loop fallback.
 */
export function GlobalOfferOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const { rides } = useDriverData();
  
  console.log(`[GLOBAL_OVERLAY] Render. Rides count: ${rides.length}, Path: ${pathname}`);
  
  const [isVisible, setIsVisible] = useState(true);

  // 1. Nextel Sound Loop Management
  useEffect(() => {
    if (rides.length > 0) {
      console.log(`[OFFER_NOTIFY_DEBUG] offers active: starting loop`);
      startNextelLoop();
    } else {
      console.log(`[OFFER_NOTIFY_DEBUG] no offers: stopping loop`);
      stopNextelLoop();
    }
    
    // Cleanup on unmount
    return () => stopNextelLoop();
  }, [rides.length]);

  // Track document visibility for background detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Ask for Notification API permission early
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  const notifiedRidesRef = useRef<Set<string>>(new Set());
  
  // Notification Trigger Engine
  useEffect(() => {
    let hasNew = false;
    let newestOffer: EnrichedRideOffer | null = null;
    
    // [VamO AUDIT] Deduplicate notifications by rideId.
    for (const offer of rides) {
      if (!notifiedRidesRef.current.has(offer.rideId)) {
        notifiedRidesRef.current.add(offer.rideId);
        hasNew = true;
        newestOffer = offer;
      }
    }

    if (hasNew && newestOffer) {
      console.log(`[OFFER_NOTIFY_DEBUG] new offer detected: ${newestOffer.id}`);
      
      // Build a human-readable label for the offer
      const isScheduledOffer = (newestOffer as any).isScheduled === true;
      const scheduledAtRaw = (newestOffer as any).scheduledAt;
      const scheduledLabel = isScheduledOffer && scheduledAtRaw
        ? `Reservado para las ${new Date(typeof scheduledAtRaw?.toMillis === 'function' ? scheduledAtRaw.toMillis() : scheduledAtRaw).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
        : newestOffer?.origin?.address || 'tu zona';

      // 1. Sound & Voice
      playOfferSound();
      announceNewRide(scheduledLabel);

      // 2. Vibration (Haptic feedback)
      if ('vibrate' in navigator) {
        navigator.vibrate([300, 100, 300, 100, 300]);
      }

      // 3. Browser background notification via Notification API
      if (document.visibilityState !== 'visible') {
        if ('Notification' in window && Notification.permission === 'granted') {
           try {
              const notifBody = isScheduledOffer
                ? `Viaje reservado · ${scheduledLabel}. Tap para ver.`
                : `De: ${newestOffer.origin?.address || 'tu ubicación'}. Tap para abrir.`;
              const n = new Notification("¡VamO: Nuevo Viaje!", {
                 body: notifBody,
                 icon: '/icon-192x192.png',
                 tag: 'new-ride-offer',
                 requireInteraction: true
              });
              
              n.onclick = () => {
                 window.focus();
                 if (pathname !== '/driver/rides') router.push('/driver/rides');
                 n.close();
              };
           } catch(err) { console.error("Notification failed", err); }
        }
      }
    }
  }, [rides, pathname, router]);

  // UI RENDER LOGIC
  console.log(`[GLOBAL_OVERLAY] Offers count: ${rides.length} | Path: ${pathname}`);
  if (rides.length === 0) return null;

  // [VamO AUDIT] Overlay must ALWAYS show if there are pending offers, 
  // ensuring the driver is notified even if the list view is lagging.
  // const isRidesScreen = pathname === '/driver/rides' || pathname === '/driver';
  // if (isRidesScreen) return null; 
  
  if (!isVisible) return null; // Logic handled by browser notifications for background

  const count = rides?.length || 0;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-[100] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div 
        onClick={() => router.push('/driver/rides')}
        className="bg-indigo-600 dark:bg-indigo-500 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-white/20 cursor-pointer shadow-[0_0_20px_rgba(79,70,229,0.5)] active:scale-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
             "w-10 h-10 rounded-full flex items-center justify-center animate-pulse",
             rides?.some(r => r?.isVip) ? "bg-amber-400 text-amber-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]" : "bg-white/20 text-white"
          )}>
            <VamoIcon name={rides?.some(r => r?.isVip) ? "star" : "car"} className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
                <p className="font-bold text-sm">¡Nuevo viaje disponible!</p>
                {rides?.some(r => r?.isVip) && (
                   <span className="bg-amber-400 text-amber-950 text-[8px] font-black px-1.5 py-0.5 rounded-full animate-bounce">VIP</span>
                )}
            </div>
            <p className="text-xs text-white/80">
              {count === 1 ? "Tenés 1 solicitud pendiente." : `Tenés ${count} solicitudes pendientes.`}
            </p>
          </div>
        </div>
        <div className={cn("flex items-center gap-2 text-xs font-black px-2 py-1 rounded-md", rides?.some(r => r?.isVip) ? "bg-amber-400 text-amber-950" : "bg-white/20 text-white")}>
           VER <VamoIcon name="chevron-right" className="ml-0.5 w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
