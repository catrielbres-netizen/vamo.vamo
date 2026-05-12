'use client';

/**
 * [VamO PUSH CLEANUP]
 * Este hook ha sido neutralizado para estabilizar la aplicación.
 * Se han eliminado todas las dependencias de firebase/messaging.
 */

import { useCallback } from 'react';

type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading' | 'failed' | 'config-error';

export function useFCM() {
  // Log mínimo de diagnóstico solicitado
  if (typeof window !== 'undefined' && !(window as any)._fcm_logged) {
    console.log("🚫 [PUSH_DISABLED] Sistema de notificaciones push desactivado temporalmente.");
    (window as any)._fcm_logged = true;
  }

  // No realiza ninguna operación, solo resuelve inmediatamente.
  const enablePush = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      console.log("ℹ️ [PUSH_DISABLED] El usuario intentó activar push, pero el sistema está deshabilitado.");
    }
    return Promise.resolve();
  }, []);

  return {
    status: 'unsupported' as FCMStatus,
    enablePush,
    error: null as string | null,
    supported: false,
    isLoading: false,
  };
}
