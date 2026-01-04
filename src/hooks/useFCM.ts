
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirebaseApp, useUser, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';


type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading';

export function useFCM() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();

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
        toast({
            variant: 'destructive',
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, necesitás habilitar las notificaciones para este sitio en la configuración de tu navegador.',
            duration: 10000,
        });
        return;
      }

      const messaging = getMessaging(firebaseApp);
      const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

      if (!vapidKey) {
        throw new Error('La clave VAPID de FCM no está configurada en las variables de entorno.');
      }

      const token = await getToken(messaging, { vapidKey });

      if (!token) {
        throw new Error('No se pudo generar el token FCM. Reintentá por favor.');
      }

      await updateDoc(doc(firestore, 'users', user.uid), {
        fcmToken: token,
      });

      setStatus('enabled');
      setError(null);
      toast({
        title: '¡Notificaciones activadas!',
        description: 'Todo listo para recibir alertas de viaje.',
      });
    } catch (err: any) {
      console.error('[FCM ERROR]', err);
      setError(err.message || 'Error al activar notificaciones');
      setStatus('idle');
      toast({
        variant: 'destructive',
        title: 'Error de Notificaciones',
        description: err.message || 'Ocurrió un error inesperado.',
      });
    }
  }, [user, isSupported, firestore, firebaseApp, toast]);

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
      // Si el permiso está concedido pero no hay token, el estado es 'idle' para que pueda activarlo
      setStatus('idle');
    }
  }, [profile?.fcmToken, isSupported]);
  
  useEffect(() => {
    if (!isSupported || !firebaseApp) return;

    const messaging = getMessaging(firebaseApp);
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      toast({
        title: payload.notification?.title || "¡Nuevo Viaje!",
        description: payload.notification?.body || "Un pasajero ha solicitado un viaje.",
        duration: 10000,
      });
    });

    return () => unsubscribe();
  }, [isSupported, firebaseApp, toast]);


  return {
    status,
    enablePush,
    error,
    isSupported,
  };
}
