/**
 * DEV ONLY — Convierte el usuario autenticado actual en admin_municipal de prueba.
 * Usar SOLO en desarrollo para facilitar el testing de VamoMuni.
 *
 * Nunca importar este módulo en rutas de producción.
 */

import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export async function makeCurrentUserMunicipal(
  city = 'Rawson',
  cityKey = 'rawson',
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    console.error('[VamoMuni DEV] makeCurrentUserMunicipal: No hay usuario autenticado.');
    throw new Error('Debés iniciar sesión antes de ejecutar esta función.');
  }

  const db = getFirestore();
  const userRef = doc(db, 'users', user.uid);

  await setDoc(
    userRef,
    {
      role: 'admin_municipal',
      city,
      cityKey,
    },
    { merge: true },
  );

  console.info(
    `[VamoMuni DEV] ✅ Usuario "${user.email}" convertido en admin_municipal de "${city}" (cityKey: "${cityKey}")`,
  );
}
