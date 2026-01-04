
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useFirebaseApp, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY!;

type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading';

export function useFCM() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const [status, setStatus] = useState<FCMStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const enablePush = useCallback(async () => {
    if (!isSupported || !user || !firestore || !firebaseApp) return;

    try {
      setStatus('loading');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('blocked');
        return;
      }

      const messaging = getMessaging(firebaseApp);

      if (!VAPID_KEY) {
          throw new Error("VAPID key not configured for FCM.");
      }

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (!token) {
        throw new Error('No se pudo generar token FCM. Es posible que necesites limpiar los datos del sitio y volver a intentarlo.');
      }

      await updateDoc(doc(firestore, 'users', user.uid), {
        fcmToken: token,
      });

      setStatus('enabled');
      setError(null);
    } catch (err: any) {
      console.error('[FCM ERROR]', err);
      setError(err.message || 'Error al activar notificaciones');
      setStatus('idle');
    }
  }, [user, isSupported, firestore, firebaseApp]);

  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    
    if (Notification.permission === 'denied') {
      setStatus('blocked');
      return;
    }

    // This is the key logic: even if permission is granted, we are 'idle' 
    // if there's no token in our database. The UI will then show the button.
    if (Notification.permission === 'granted' && profile?.fcmToken) {
      setStatus('enabled');
    } else {
      setStatus('idle');
    }
  }, [profile?.fcmToken, isSupported]);
  
  useEffect(() => {
    if (!isSupported || !firebaseApp) return;

    try {
      const messaging = getMessaging(firebaseApp);
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received. ', payload);
        // We can show a toast here if we want, but the realtime listener handles the UI update.
        // This is useful for debugging or for a sound effect.
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Could not initialize foreground message listener", e);
    }
  }, [isSupported, firebaseApp]);


  return {
    status,
    enablePush,
    error,
    supported: isSupported,
  };
}
