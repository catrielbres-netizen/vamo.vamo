
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useFirebaseApp, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

// Usamos la variable de entorno estandarizada
const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

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

    if (!VAPID_KEY) {
        console.error("[FCM ERROR] La VAPID key no está configurada en las variables de entorno (NEXT_PUBLIC_FCM_VAPID_KEY).");
        setError("Error de configuración: falta la clave VAPID.");
        setStatus('idle');
        return;
    }
    
    try {
      setStatus('loading');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('blocked');
        setError("El usuario no concedió permiso para notificaciones.");
        return;
      }

      const messaging = getMessaging(firebaseApp);

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (!token) {
        throw new Error('No se pudo generar el token FCM. Revisa la configuración del proyecto y las claves.');
      }

      await updateDoc(doc(firestore, 'users', user.uid), {
        fcmToken: token,
        fcmUpdatedAt: serverTimestamp(),
      });

      setStatus('enabled');
      setError(null);
    } catch (err: any) {
      console.error('[FCM ERROR]', err);
      // Silently fail to 'idle' on 403 errors, as it's a platform issue
      if (err.message?.includes('403')) {
        setError('El servicio de registro de notificaciones está bloqueado por el proveedor.');
      } else {
        setError(err.message || 'Error al activar notificaciones');
      }
      setStatus('idle');
    }
  }, [user, profile, isSupported, firestore, firebaseApp]);

  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    
    if (Notification.permission === 'denied') {
      setStatus('blocked');
      return;
    }

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
        console.log('Mensaje recibido en primer plano: ', payload);
        const notificationTitle = payload.notification?.title || "VamO";
        const notificationOptions = {
          body: payload.notification?.body || "Tienes una nueva notificación",
          icon: '/icons/favicon-32x32.png',
        };
        new Notification(notificationTitle, notificationOptions);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("No se pudo inicializar el listener de mensajes en primer plano", e);
    }
  }, [isSupported, firebaseApp]);


  return {
    status,
    enablePush,
    error,
    supported: isSupported,
  };
}
