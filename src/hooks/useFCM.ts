// src/hooks/useFCM.ts
'use client';
import { useState, useEffect } from 'react';
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


  useEffect(() => {
    // This effect runs only on the client
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (notificationPermission !== 'granted' || !firebaseApp) return;

    const messaging = getMessaging(firebaseApp);

    // Handle foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      setLatestNotification(payload); // Set the payload in state
    });

    return () => {
      unsubscribe(); // Unsubscribe from the message listener on cleanup
    };
  }, [firebaseApp, notificationPermission]);


  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !firebaseApp || !firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'El entorno no es compatible con notificaciones.' });
        return;
    }
    
    // 1. Request Permission
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission); // Update state immediately

    if (permission === 'granted') {
        console.log('Notification permission granted.');
        // 2. Get Token and Save to Firestore
        try {
            const messaging = getMessaging(firebaseApp);
            const currentToken = await getToken(messaging, {
                vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
            });

            if (currentToken) {
                // Save token to Firestore
                const userProfileRef = doc(firestore, 'users', user.uid);
                await updateDoc(userProfileRef, {
                    fcmToken: currentToken,
                });
                toast({ title: '¡Notificaciones activadas!', description: 'Estás listo para recibir alertas de viaje.' });
            } else {
                toast({ variant: 'destructive', title: 'No se pudo obtener el token', description: 'Por favor, intentá de nuevo. Es posible que necesites recargar la página.' });
            }
        } catch (err) {
            console.error('An error occurred while retrieving token or saving it.', err);
            toast({ variant: 'destructive', title: 'Error al registrar token', description: 'No se pudo completar el registro para las notificaciones.' });
        }
    } else {
        toast({
            variant: 'destructive',
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, por favor habilitá las notificaciones para este sitio en la configuración de tu navegador y luego recargá la página.',
            duration: 10000,
        });
    }
  }


  return { notificationPermission, requestPermission, latestNotification };
}
