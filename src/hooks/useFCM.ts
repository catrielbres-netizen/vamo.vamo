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
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (notificationPermission !== 'granted' || !firebaseApp) return;

    const messaging = getMessaging(firebaseApp);

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      setLatestNotification(payload);
    });

    return () => {
      unsubscribe();
    };
  }, [firebaseApp, notificationPermission]);

  const checkNotificationStatus = async () => {
    if (typeof window === 'undefined') {
        return { success: false, message: 'Entorno no es un navegador.' };
    }
    if (!window.isSecureContext) {
        return { success: false, message: 'La página no es segura (no es HTTPS). Las notificaciones requieren HTTPS o localhost.' };
    }
    if (!('Notification' in window)) {
        return { success: false, message: 'Este navegador no soporta Notificaciones.' };
    }
    if (!process.env.NEXT_PUBLIC_FCM_VAPID_KEY) {
        return { success: false, message: 'La VAPID Key de FCM no está configurada en las variables de entorno.' };
    }
     if (!firebaseApp || !firestore || !user) {
        return { success: false, message: 'Firebase o el usuario no están listos.' };
    }
    
    try {
        const messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY });
        if (token) {
            return { success: true, message: `El sistema está listo. Tu token FCM es: ${token.substring(0, 15)}...` };
        } else {
             return { success: false, message: 'No se pudo obtener el token. El permiso puede estar bloqueado por el navegador.' };
        }
    } catch(err: any) {
        return { success: false, message: `Error al obtener token: ${err.message}` };
    }
  }


  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !firebaseApp || !firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'El entorno no es compatible con notificaciones.' });
        return;
    }
    
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
        try {
            const messaging = getMessaging(firebaseApp);
            const currentToken = await getToken(messaging, {
                vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
            });

            if (currentToken) {
                const userProfileRef = doc(firestore, 'users', user.uid);
                await updateDoc(userProfileRef, { fcmToken: currentToken });
                toast({ title: '¡Notificaciones activadas!', description: 'Estás listo para recibir alertas de viaje.' });
            } else {
                toast({ variant: 'destructive', title: 'No se pudo obtener el token', description: 'Por favor, intentá de nuevo.' });
            }
        } catch (err) {
            console.error('An error occurred while retrieving token or saving it.', err);
            toast({ variant: 'destructive', title: 'Error al registrar token', description: 'No se pudo completar el registro para las notificaciones.' });
        }
    } else {
        toast({
            variant: 'destructive',
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, habilitá las notificaciones para este sitio en la configuración de tu navegador.',
            duration: 10000,
        });
    }
  }


  return { notificationPermission, requestPermission, latestNotification, checkNotificationStatus };
}
