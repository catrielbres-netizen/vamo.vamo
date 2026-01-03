// src/hooks/useFCM.ts
'use client';
import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { useFirebaseApp, useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export function useFCM() {
  const firebaseApp = useFirebaseApp();
  const { profile, user } = useUser();
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
    if (!firebaseApp || !firestore || !user || !profile || profile.role !== 'driver') {
      return;
    }

    const messaging = getMessaging(firebaseApp);

    // 1. Request permission and get token
    const requestPermissionAndGetToken = async () => {
      // Check if permission is already granted
      if (notificationPermission === 'granted') {
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
                console.log('FCM token updated in Firestore.');
              }
            } else {
              console.log('No registration token available. Request permission to generate one.');
            }
          } catch (err) {
            console.error('An error occurred while retrieving token. ', err);
          }
      }
    };

    requestPermissionAndGetToken();

    // 2. Handle foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      setLatestNotification(payload); // Set the payload in state
    });

    return () => {
      unsubscribe(); // Unsubscribe from the message listener on cleanup
    };
  }, [firebaseApp, firestore, user, profile, notificationPermission, toast]);


  const requestPermission = async () => {
    if (notificationPermission !== 'granted') {
        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission === 'granted') {
                console.log('Notification permission granted.');
                // Re-trigger the main effect to get the token
                // This is a bit of a hack, but works for this case.
                window.location.reload();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Notificaciones Bloqueadas',
                    description: 'No recibirás avisos de nuevos viajes. Habilítalas en la configuración de tu navegador.',
                });
            }
        } catch(e) {
            console.error("Error requesting notification permission:", e);
        }
    }
  }


  return { notificationPermission, requestPermission, latestNotification };
}
