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

async function checkEduardo() {
  const docRef = db.collection('users').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3');
  const snap = await docRef.get();
  if (snap.exists) {
    console.log("Eduardo data:", snap.data());
  } else {
    console.log("No existe el usuario Eduardo");
  }
}

checkEduardo().catch(console.error);
