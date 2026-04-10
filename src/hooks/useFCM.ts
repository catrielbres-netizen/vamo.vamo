'use client';

if (typeof window !== 'undefined') {
  console.log("📦 [FCM] Module useFCM.ts loaded in browser");
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * FCM Status Types
 * unsupported: Browser does not support push notifications or FCM
 * blocked: Browser permission denied
 * idle: Initial state, waiting for action or auto-trigger
 * enabled: Token generated and (if possible) saved to Firestore
 * loading: Token generation or permission request in progress
 * failed: Error during the process
 * config-error: Missing VAPID or Firebase config
 */
type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading' | 'failed' | 'config-error';
const COOLDOWN_KEY = 'vamo_fcm_cooldown_until';

// GLOBALS: Centralized state across all component instances to prevent race conditions
let globalInFlight = false;
let globalStatus: FCMStatus = 'idle';
let globalError: string | null = null;
const statusListeners = new Set<() => void>();

function setGlobalFCMState(status: FCMStatus, error: string | null = null) {
  globalStatus = status;
  globalError = error;
  statusListeners.forEach(listener => listener());
}

export function useFCM() {
  // Log at the very start of the hook mount/render - NO CONDITIONS
  if (typeof window !== 'undefined') {
    console.log("[FCM] HOOK MOUNTED/RENDERED");
  }

  const hookRenderCount = useRef(0);
  hookRenderCount.current++;

  const { user, profile, loading: authLoading } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();

  const [localStatus, setLocalStatus] = useState<FCMStatus>(globalStatus);
  const [localError, setLocalError] = useState<string | null>(globalError);
  const [supported, setSupported] = useState<boolean | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Sync with global state
  useEffect(() => {
    const handleUpdate = () => {
      setLocalStatus(globalStatus);
      setLocalError(globalError);
    };
    statusListeners.add(handleUpdate);
    handleUpdate();
    return () => { statusListeners.delete(handleUpdate); };
  }, []);

  // 1. Initial Browser Compatibility Check
  useEffect(() => {
    const checkSupport = async () => {
      if (typeof window === 'undefined') return;

      const isFCMSupported = await isSupported();
      const hasSW = 'serviceWorker' in navigator;
      const hasPush = 'PushManager' in window;
      const isFeatureSupported = isFCMSupported && hasSW && hasPush;

      console.log(`[FCM] Estado inicial:`, {
        isFCMSupported,
        hasSW,
        hasPush,
        permission: Notification.permission,
        isFeatureSupported
      });

      setSupported(isFeatureSupported);

      if (!isFeatureSupported) {
        console.warn('[FCM] Navegador no compatible con Notificaciones Push.');
        setGlobalFCMState('unsupported');
      } else if (!process.env.NEXT_PUBLIC_FCM_VAPID_KEY) {
        console.error('[FCM] VAPID Key faltante en variables de entorno.');
        setGlobalFCMState('config-error');
      }
    };
    checkSupport();
  }, []);

  // 2. Register / Find Service Worker
  useEffect(() => {
    if (supported === true && typeof window !== 'undefined') {
      const registerSW = async () => {
        try {
          const swUrl = `/firebase-messaging-sw.js?firebaseConfig=${encodeURIComponent(JSON.stringify(firebaseConfig))}`;
          const registration = await navigator.serviceWorker.register(swUrl);
          swRegistrationRef.current = registration;
          console.log('[FCM] Service Worker registrado correctamente.');
        } catch (err) {
          console.error('[FCM] Error al registrar Service Worker:', err);
        }
      };
      registerSW();
    }
  }, [supported]);

  const enablePush = useCallback(async (isManual: boolean = false) => {
    // Detailed logs before any early return
    console.log('[FCM] Ejecutando enablePush:', {
      isManual,
      supported,
      uid: user?.uid,
      hasFirestore: !!firestore,
      hasApp: !!firebaseApp,
      vapid: !!process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
      globalInFlight
    });

    if (supported !== true) {
      console.log('[FCM] Abortando: Navegador no compatible.');
      if (supported === false) setGlobalFCMState('unsupported');
      return;
    }

    if (!user) {
      console.log('[FCM] Abortando: No hay usuario autenticado.');
      return;
    }

    if (!firestore || !firebaseApp || !process.env.NEXT_PUBLIC_FCM_VAPID_KEY) {
      console.log('[FCM] Abortando: Configuración incompleta.');
      return;
    }

    if (globalInFlight) {
      console.log('[FCM] Abortando: Operación ya en curso.');
      return;
    }

    // Early exit if permission is already denied
    if (Notification.permission === 'denied') {
      console.log('[FCM] Abortando: Permiso denegado permanentemente en el navegador.');
      setGlobalFCMState('blocked', 'Permiso de notificaciones bloqueado por el navegador.');
      return;
    }

    // Cooldown logic for auto-triggers (non-manual)
    if (!isManual && typeof window !== 'undefined') {
      const cooldownUntil = sessionStorage.getItem(COOLDOWN_KEY);
      if (cooldownUntil && Date.now() < parseInt(cooldownUntil, 10)) {
        console.log('[FCM] Abortando: En periodo de cooldown (auto-trigger).');
        return;
      }
    }

    try {
      globalInFlight = true;
      setGlobalFCMState('loading');

      console.log('[FCM] Solicitando permiso (Notification.requestPermission)...');
      const permission = await Notification.requestPermission();
      console.log('[FCM] Resultado del permiso:', permission);

      if (permission !== 'granted') {
        setGlobalFCMState('blocked', 'Permiso de notificaciones no otorgado.');
        globalInFlight = false;
        return;
      }

      // Get the Messaging instance
      const messaging = getMessaging(firebaseApp);

      // Ensure SW is ready before getting token
      if (!swRegistrationRef.current) {
        console.log('[FCM] Esperando que el Service Worker esté "ready"...');
        swRegistrationRef.current = await navigator.serviceWorker.ready;
      }

      console.log('[FCM] Intentando generar Token Web Push con VAPID Key...');

      // EXPLICIT: Pass serviceWorkerRegistration to getToken
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
        serviceWorkerRegistration: swRegistrationRef.current
      });

      if (!token) {
        throw new Error('El navegador o Firebase devolvieron un token vacío.');
      }

      console.log('[FCM] ¡TOKEN GENERADO CON ÉXITO! ->', token);

      // 3. Save to Firestore logic
      const userRef = doc(firestore, 'users', user.uid);

      // Update only if necessary to avoid unnecessary writes
      if (profile?.fcmToken !== token) {
        console.log('[FCM] Guardando token en Firestore para el UID:', user.uid);
        // Use setDoc with merge: true for safety (creates document if it doesn't exist)
        await setDoc(userRef, {
          fcmToken: token,
          fcmUpdatedAt: serverTimestamp(),
        }, { merge: true });
        console.log('[FCM] Token guardado correctamente en Firestore.');
      } else {
        console.log('[FCM] El token actual coincide con el de Firestore. No se requiere actualización.');
      }

      setGlobalFCMState('enabled');
    } catch (err: any) {
      console.error('[FCM] ERROR CRÍTICO CAPTURADO:', err);

      const message = err?.message || String(err);

      // Diagnostic for 401 errors
      if (message.includes('401') || message.includes('unauthorized') || message.includes('authentication')) {
        console.error('[FCM] DIAGNÓSTICO: Error de autorización (401). Revisar VAPID Key, FCM Registration API y configuración de Firebase.');
        setGlobalFCMState('failed', 'Error 401: Revisa la VAPID Key y la FCM Registration API en Google Cloud.');
      } else if (message.includes('permission-denied') || message.includes('Permission denied')) {
        setGlobalFCMState('blocked', 'Permiso denegado por Firebase (Security Rules o Config).');
      } else {
        setGlobalFCMState('failed', message);
      }

      // Add cooldown for auto-retry
      if (!isManual) {
        const cooldownDuration = 5 * 60 * 1000; // 5 mins
        sessionStorage.setItem(COOLDOWN_KEY, (Date.now() + cooldownDuration).toString());
      }
    } finally {
      globalInFlight = false;
    }
  }, [user, profile?.fcmToken, supported, firestore, firebaseApp]);

  // Auto-trigger if authenticated and permission is granted but no token present
  useEffect(() => {
    if (typeof window !== 'undefined' && user && !authLoading && supported === true) {
      const hasPermission = Notification.permission === 'granted';
      const needsToken = !profile?.fcmToken;
      const isIdle = globalStatus === 'idle' || globalStatus === 'failed';

      console.log('[FCM] Evaluación de auto-trigger:', {
        hasPermission,
        needsToken,
        globalStatus,
        isIdle,
        isProfileLoaded: !!profile
      });

      if (hasPermission && needsToken && isIdle) {
        const cooldownUntil = sessionStorage.getItem(COOLDOWN_KEY);
        if (!cooldownUntil || Date.now() > parseInt(cooldownUntil, 10)) {
          console.log('[FCM] Auto-trigger disparado: Generando token faltante...');
          enablePush(false);
        } else {
          console.log('[FCM] Auto-trigger omitido por COOLDOWN.');
        }
      }
    }
  }, [user, authLoading, profile, supported, enablePush]);

  return {
    status: localStatus,
    enablePush,
    error: localError,
    supported: supported === true,
    isLoading: localStatus === 'loading',
  };
}

