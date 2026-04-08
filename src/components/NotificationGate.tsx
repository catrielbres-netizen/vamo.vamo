'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useFCM } from '@/hooks/useFCM';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'vamo_notification_gate_dismissed';

interface NotificationGateProps {
  children: React.ReactNode;
}

/**
 * NotificationGate
 * Shows a fullscreen notification permission prompt before rendering children.
 * The gate is bypassed if:
 *  - Notifications are already granted
 *  - The user is on a device/browser that doesn't support push
 *  - The user already dismissed the gate (stored in localStorage)
 * The user can always skip via "Más tarde".
 */
export function NotificationGate({ children }: NotificationGateProps) {
  console.log("🔔 [GATE] NotificationGate rendering...");
  const { profile } = useUser();
  const { status, enablePush, supported } = useFCM();
  const [shouldShowGate, setShouldShowGate] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const alreadyHandled = status === 'enabled' || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
    const notSupported = !supported || status === 'unsupported' || status === 'config-error';
    const dismissed = localStorage.getItem(STORAGE_KEY);
    const isDemo = profile?.email?.includes('demo_') && profile?.email?.endsWith('@vamo.com');

    if (alreadyHandled || notSupported || dismissed || isDemo) {
      setShouldShowGate(false);
    } else {
      setShouldShowGate(true);
    }
  }, [status, supported, profile]);

  const handleActivate = async () => {
    setIsActivating(true);
    await enablePush();
    setIsActivating(false);
    // After activation attempt, always proceed (success or fail)
    localStorage.setItem(STORAGE_KEY, 'true');
    setShouldShowGate(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShouldShowGate(false);
  };

  // Still loading FCM status — wait briefly
  if (status === 'loading') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!shouldShowGate) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212] p-6">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
          <VamoIcon name="bell" className="w-10 h-10 text-indigo-400" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Activá las Notificaciones</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Para recibir alertas de viajes, llegadas del conductor y actualizaciones en tiempo real, necesitamos tu permiso.
          </p>
        </div>

        {status === 'blocked' && (
          <div className="w-full rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 text-left">
            <p className="font-semibold">Notificaciones bloqueadas en el navegador</p>
            <p className="text-xs mt-1">Desbloqueálas desde el candado 🔒 en la barra de dirección → Configuración del sitio → Notificaciones → Permitir.</p>
          </div>
        )}

        {/* Buttons */}
        {status !== 'blocked' && (
          <Button
            onClick={handleActivate}
            disabled={isActivating}
            className="w-full h-13 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base rounded-xl"
          >
            {isActivating ? (
              <><VamoIcon name="loader" className="w-5 h-5 animate-spin mr-2" /> Activando...</>
            ) : (
              <><VamoIcon name="bell" className="w-5 h-5 mr-2" /> Activar Notificaciones</>
            )}
          </Button>
        )}

        <button
          onClick={handleSkip}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors underline underline-offset-2"
        >
          Más tarde
        </button>
      </div>
    </div>
  );
}
