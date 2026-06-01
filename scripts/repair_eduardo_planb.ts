import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-adminsdk.json', 'utf8'));

if (!initializeApp.apps?.length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function fixEduardo() {
  const docRef = db.collection('users').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3');
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log("No existe el usuario Eduardo");
    return;
  }
  
  const data = snap.data() || {};
  
  const updates: any = {};
  
  const { FieldValue } = await import('firebase-admin/firestore');
  
  // Clean up legacy fields
  const fieldsToRemove = ['municipalStatus', 'onboardingStep'];
  for (const field of fieldsToRemove) {
    if (data[field] !== undefined) {
      updates[field] = FieldValue.delete();
    }
  }

  // Adjust Plan B status to a coherent flow if necessary
  // Current: planBStatus: 'city_waiting_activation', docsStatus: 'under_review'
  // But wait, the user asked:
  // "Dejarlo en estado Plan B coherente: planBStatus: pending_docs o under_review según corresponda"
  updates.planBStatus = 'pending_docs';
  updates.profileCompleted = false;

  await docRef.update(updates);
  console.log("Usuario Eduardo reparado. Campos actualizados:", updates);
}

fixEduardo().catch(console.error);
