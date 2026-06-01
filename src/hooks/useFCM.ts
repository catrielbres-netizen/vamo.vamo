'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { logInfo, logError, logWarn } from '@/lib/telemetry/logger';

type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading' | 'failed' | 'config-error';

export function useFCM() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();

  const [status, setStatus] = useState<FCMStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const tokenRegisteredRef = useRef<string | null>(null);

  // Check support on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkSupport = async () => {
      try {
        const { isSupported } = await import('firebase/messaging');
        const supportedResult = await isSupported();
        setSupported(supportedResult);
        if (!supportedResult) {
          setStatus('unsupported');
          logInfo('FCM_SUPPORT_CHECK', { supported: false, reason: 'browser_not_supported' });
        } else {
          // Check current permission
          if (Notification.permission === 'denied') {
            setStatus('blocked');
          } else if (Notification.permission === 'granted') {
            // Already granted, auto-enable
            enablePush(false);
          }
        }
      } catch (err: any) {
        console.warn('[FCM] Error checking support:', err);
        setSupported(false);
        setStatus('unsupported');
      }
    };

    checkSupport();
  }, [app]);

  const enablePush = useCallback(async (isManual: boolean = false) => {
    if (typeof window === 'undefined' || !user || !firestore) return;

    setIsLoading(true);
    setError(null);

    try {
      const { isSupported } = await import('firebase/messaging');
      const supportedResult = await isSupported();
      if (!supportedResult) {
        setStatus('unsupported');
        setIsLoading(false);
        return;
      }

      // Check / Request permission
      if (Notification.permission === 'default') {
        setStatus('loading');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setStatus('blocked');
          setIsLoading(false);
          logWarn('FCM_PERMISSION_DENIED', { actor: user.uid, isManual });
          return;
        }
      } else if (Notification.permission === 'denied') {
        setStatus('blocked');
        setIsLoading(false);
        if (isManual) {
          logWarn('FCM_PERMISSION_BLOCKED_ALREADY', { actor: user.uid });
        }
        return;
      }

      setStatus('loading');
      const { getMessaging, getToken } = await import('firebase/messaging');
      const messaging = getMessaging(app);

      // Retrieve VapidKey from environment
      const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
      if (!vapidKey) {
        console.warn('[FCM] VAPID Key missing in configuration.');
        setStatus('config-error');
        setIsLoading(false);
        return;
      }

      // Get token
      const token = await getToken(messaging, { vapidKey });
      if (!token) {
        throw new Error('FCM token empty');
      }

      // Avoid duplicate saves
      if (tokenRegisteredRef.current === token) {
        setStatus('enabled');
        setIsLoading(false);
        return;
      }

      // Save token to Firestore
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, {
        fcmToken: token, // Backwards compatibility
        fcmTokens: arrayUnion(token), // Multi-device array
        updatedAt: new Date()
      });

      tokenRegisteredRef.current = token;
      setStatus('enabled');
      logInfo('FCM_TOKEN_REGISTERED', { actor: user.uid, tokenHash: token.substring(0, 8) });

    } catch (err: any) {
      console.error('[FCM] Error registering push notifications:', err);
      setError(err.message || 'Error desconocido');
      setStatus('failed');
      logError('FCM_REGISTRATION_FAILED', {
        actor: user?.uid || 'unknown',
        error: err.message || 'unknown',
        stack: err.stack || ''
      });
    } finally {
      setIsLoading(false);
    }
  }, [app, user, firestore]);

  return {
    status,
    enablePush,
    error,
    supported,
    isLoading,
  };
}
