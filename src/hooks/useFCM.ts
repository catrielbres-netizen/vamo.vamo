
'use client';
import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { useFirebaseApp, useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function useFCM() {
  const firebaseApp = useFirebaseApp();
  const { profile, user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    // This effect runs only on the client
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!firebaseApp || !firestore || !user || !profile || profile.role !== 'driver') {
      return;
    }

    const messaging = getMessaging(firebaseApp);

    // Function to request permission and get token
    const requestPermissionAndGetToken = async () => {
      if (notificationPermission !== 'granted') {
         try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission !== 'granted') {
                console.log('El usuario no permitió las notificaciones.');
                toast({
                    variant: 'destructive',
                    title: 'Notificaciones Bloqueadas',
                    description: 'No recibirás avisos de nuevos viajes. Habilítalas en la configuración de tu navegador.',
                });
                return;
            }
         } catch(e) {
            console.error("Error requesting notification permission:", e);
            return;
         }
      }
      
      // Get token
      try {
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
        });

        if (currentToken) {
          // Check if token is new or different from the one in Firestore
          if (profile.fcmToken !== currentToken) {
            const userProfileRef = doc(firestore, 'users', user.uid);
            await updateDoc(userProfileRef, {
              fcmToken: currentToken,
            });
            console.log('FCM token actualizado en Firestore.');
          }
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      } catch (err) {
        console.log('An error occurred while retrieving token. ', err);
      }
    };

    requestPermissionAndGetToken();

    // Handle foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Mensaje recibido en primer plano. ', payload);
      toast({
        title: payload.notification?.title || "Nuevo Viaje",
        description: payload.notification?.body || "Hay un nuevo viaje disponible.",
        action: (
            <button onClick={() => router.push('/driver/rides')} className="p-2 bg-primary text-primary-foreground rounded">
                Ver Viaje
            </button>
        )
      });
    });

    return () => {
      unsubscribe();
    };
  }, [firebaseApp, firestore, user, profile, notificationPermission, toast, router]);

  return { notificationPermission };
}
