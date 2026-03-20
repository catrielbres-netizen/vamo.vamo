'use client';

import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import { getMessaging, getToken } from 'firebase/messaging';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

type FCMStatus = 'unsupported' | 'blocked' | 'idle' | 'enabled' | 'loading' | 'config-error';

export function useFCM() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const [status, setStatus] = useState<FCMStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // Effect to register the service worker as soon as the component mounts on the client.
  // This is a critical step for background notifications.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && VAPID_KEY) {
      // The config is constructed here, only on the client, to avoid server errors.
      const firebaseConfig = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };

      const swUrl = `/firebase-messaging-sw.js?firebaseConfig=${encodeURIComponent(JSON.stringify(firebaseConfig))}`;
      
      navigator.serviceWorker.register(swUrl)
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(err => {
          console.error('Service Worker registration failed:', err);
        });
    }
  }, []);

  // Effect to determine the initial status of push notifications.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      setIsSupported(supported);

      if (!supported) {
        setStatus('unsupported');
      } else if (!VAPID_KEY) {
        console.error("[FCM ERROR] La VAPID key no está configurada en las variables de entorno (NEXT_PUBLIC_FCM_VAPID_KEY).");
        setStatus('config-error');
      } else if (Notification.permission === 'denied') {
        setStatus('blocked');
      } else if (Notification.permission === 'granted' && profile?.fcmToken) {
        setStatus('enabled');
      } else {
        setStatus('idle');
      }
    }
  }, [profile?.fcmToken]);

  const enablePush = useCallback(async () => {
    if (!isSupported || !user || !firestore || !firebaseApp || !VAPID_KEY) return;
    
    try {
      setStatus('loading');
      setError(null);

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('blocked');
        setError("El usuario no concedió permiso para notificaciones.");
        return;
      }
      
      // Get the service worker registration, which should be ready from the useEffect.
      const registration = await navigator.serviceWorker.ready;

      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, { 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
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
      if (err.code === 'messaging/token-subscribe-failed') {
          setError("La clave de seguridad para notificaciones (VAPID key) es inválida. Un administrador debe configurarla correctamente en el proyecto.");
      } else if (err.code === 'messaging/permission-blocked' || err.code === 'messaging/permission-default') {
         setError("Permiso de notificación denegado. Habilítalo en la configuración de tu navegador.");
         setStatus('blocked');
      } else if (err.message?.includes('403')) {
        setError('El servicio de registro de notificaciones está bloqueado por el proveedor.');
      } else {
        setError(err.message || 'Error desconocido al activar notificaciones.');
      }
      setStatus('idle');
    }
  }, [user, isSupported, firestore, firebaseApp]);

  return {
    status,
    enablePush,
    error,
    supported: isSupported,
  };
}
