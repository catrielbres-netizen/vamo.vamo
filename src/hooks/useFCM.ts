// src/hooks/useFCM.ts
'use client';
import { useState, useEffect, useMemo } from 'react';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { useFirebaseApp, useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export function useFCM() {
  const firebaseApp = useFirebaseApp();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);
  const [latestNotification, setLatestNotification] = useState<MessagePayload | null>(null);

  const isSupported = useMemo(() => {
    if (typeof navigator !== 'undefined') {
        // All these conditions must be true for push to be supported.
        return 'serviceWorker' in navigator &&
               'PushManager' in window &&
               typeof Notification !== 'undefined';
    }
    return false;
  }, []);

  // Effect to set the initial notification permission status
  useEffect(() => {
    if (isSupported) {
      setNotificationPermission(Notification.permission);
    }
  }, [isSupported]);

  // Effect to listen for incoming messages when the app is in the foreground
  useEffect(() => {
    if (!isSupported || notificationPermission !== 'granted' || !firebaseApp) return;

    const messaging = getMessaging(firebaseApp);

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      setLatestNotification(payload);
    });

    return () => {
      unsubscribe();
    };
  }, [firebaseApp, notificationPermission, isSupported]);


  /**
   * Main function to request permission, get the token, and save it to Firestore.
   * This is the single source of truth for enabling notifications.
   */
  const requestPermissionAndToken = async () => {
    if (!isSupported || !firebaseApp || !firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'El entorno no es compatible o el usuario no está autenticado.' });
        return;
    }
    
    // 1. Request Permission from the user
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission); // Update state

    if (permission === 'granted') {
        try {
            // 2. Get the FCM token
            const messaging = getMessaging(firebaseApp);
            const currentToken = await getToken(messaging, {
                vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
            });

            if (currentToken) {
                // 3. Save the token to the user's profile in Firestore
                const userProfileRef = doc(firestore, 'users', user.uid);
                await updateDoc(userProfileRef, { fcmToken: currentToken });
                toast({ title: '¡Notificaciones activadas!', description: 'Estás listo para recibir alertas de viaje.' });
            } else {
                 toast({ variant: 'destructive', title: 'No se pudo obtener el token', description: 'El proceso falló. Por favor, intentá de nuevo.' });
            }
        } catch (err) {
            console.error('An error occurred while retrieving token or saving it.', err);
            toast({ variant: 'destructive', title: 'Error al registrar token', description: 'No se pudo completar el registro para las notificaciones.' });
        }
    } else {
        toast({
            variant: 'destructive',
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, habilitá las notificaciones para este sitio en la configuración de tu navegador (haciendo clic en el candado 🔒 en la barra de direcciones).',
            duration: 10000,
        });
    }
  }


  return { 
      isSupported, 
      notificationPermission, 
      requestPermission: requestPermissionAndToken, // Expose the consolidated function
      latestNotification 
  };
}
