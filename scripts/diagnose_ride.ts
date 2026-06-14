import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d * 1000;
}
function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('service-account.json');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
if (getApps().length === 0) {
  initializeApp({ projectId });
}
const db = getFirestore();

async function diagnose() {
  const standId = 'stand_170e4b0f';
  const standDoc = await db.collection('taxi_stands').doc(standId).get();
  const standData = standDoc.data()!;
  
  const ridesQuery = await db.collection('rides').orderBy('createdAt', 'desc').limit(1).get();
  const rideDoc = ridesQuery.docs[0];
  const rideData = rideDoc.data();
  
  console.log(`Último viaje ID: ${rideDoc.id}`);
  
  // Imprimir TODO el objeto para ver dónde están las coordenadas y los campos de taxi stand
  console.log(JSON.stringify(rideData, null, 2));
}

diagnose().catch(console.error);
