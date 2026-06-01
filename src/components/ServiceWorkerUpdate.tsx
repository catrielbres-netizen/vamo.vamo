'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { VamoIcon } from './VamoIcon';
import { toast } from '@/hooks/use-toast';

import { useUser } from '@/firebase';

export function ServiceWorkerUpdate() {
  const { profile } = useUser();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [deferredUpdate, setDeferredUpdate] = useState(false);

  const hasActiveRide = !!profile?.activeRideId;

  useEffect(() => {
    if (!hasActiveRide && deferredUpdate) {
      setShowReload(true);
      setDeferredUpdate(false);
    }
  }, [hasActiveRide, deferredUpdate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registrar el evento de cambio en el Service Worker
    const onUpdate = (registration: ServiceWorkerRegistration) => {
      setWaitingWorker(registration.waiting);
      if (hasActiveRide) {
        setDeferredUpdate(true);
      } else {
        setShowReload(true);
      }
    };

    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        // 1. Si ya hay una actualización esperando
        if (registration.waiting) {
          onUpdate(registration);
        }

        // 2. Escuchar si se encuentra una nueva actualización
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                onUpdate(registration);
              }
            });
          }
        });
      }
    });

    // Escuchar el evento de controlador cambiado (cuando se activa el nuevo SW)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const reloadPage = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowReload(false);
  };

  if (!showReload) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-bounce">
            <VamoIcon name="refresh-cw" className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tight">¡Nueva versión disponible!</p>
            <p className="text-[10px] text-indigo-100 opacity-80">Actualizá para recibir los últimos cambios.</p>
          </div>
        </div>
        <Button 
          onClick={reloadPage}
          size="sm"
          className="bg-white text-indigo-600 hover:bg-indigo-50 font-bold px-5 h-10 rounded-xl shadow-lg"
        >
          ACTUALIZAR
        </Button>
      </div>
    </div>
  );
}
