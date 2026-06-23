import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

interface GhostCandidate {
  uid: string;
  parentExists: boolean;
  subcollections: { name: string; count: number }[];
  needs_manual_review: boolean;
  relations: string[];
  reason: string;
}

async function auditGhostUsers() {
  console.log('--- INICIANDO AUDITORIA DE USUARIOS FANTASMA ---');

  // listDocuments returns all document references in a collection, including those that do not exist but have subcollections
  const docRefs = await db.collection('users').listDocuments();
  console.log(`Total de IDs listados en 'users': ${docRefs.length}`);

  const candidates: GhostCandidate[] = [];
  let totalGhostUsers = 0;
  let totalWithRelations = 0;

  // We can fetch them in batches to be faster, but let's just do it sequentially or in chunks
  // to avoid hitting rate limits if there are many.
  for (let i = 0; i < docRefs.length; i++) {
    const docRef = docRefs[i];
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      // It's a real user, we skip it for this script
      continue;
    }

    totalGhostUsers++;
    const uid = docRef.id;
    let needs_manual_review = false;
    const relations: string[] = [];
    const subcollectionsInfo: { name: string; count: number }[] = [];

    // Check subcollections
    const collections = await docRef.listCollections();
    for (const col of collections) {
      const snap = await col.get();
      subcollectionsInfo.push({ name: col.id, count: snap.size });
      
      // If the subcollection is legal_acceptances, we might want to flag it as important
      if (col.id === 'legal_acceptances' && snap.size > 0) {
        relations.push('legal_acceptances subcollection');
        needs_manual_review = true;
      }
    }

    // Check global relations
    const walletSnap = await db.collection('wallets').doc(uid).get();
    if (walletSnap.exists) {
      relations.push('wallet');
      needs_manual_review = true;
    }

    const passengerRides = await db.collection('rides').where('passengerId', '==', uid).limit(1).get();
    if (!passengerRides.empty) {
      relations.push('rides (passenger)');
      needs_manual_review = true;
    }

    const driverRides = await db.collection('rides').where('driverId', '==', uid).limit(1).get();
    if (!driverRides.empty) {
      relations.push('rides (driver)');
      needs_manual_review = true;
    }

    const withdrawalsUser = await db.collection('withdrawal_requests').where('userId', '==', uid).limit(1).get();
    if (!withdrawalsUser.empty) {
      relations.push('withdrawal_requests (userId)');
      needs_manual_review = true;
    }
    
    const withdrawalsDriver = await db.collection('withdrawal_requests').where('driverId', '==', uid).limit(1).get();
    if (!withdrawalsDriver.empty) {
      relations.push('withdrawal_requests (driverId)');
      needs_manual_review = true;
    }

    if (needs_manual_review) {
      totalWithRelations++;
    }

    candidates.push({
      uid: uid,
      parentExists: false,
      subcollections: subcollectionsInfo,
      needs_manual_review: needs_manual_review,
      relations: relations,
      reason: 'Ghost user (documento padre no existe pero tiene subcolecciones)'
    });
  }

  console.log('--- REPORTE DE GHOST USERS ---');
  console.log(`Total de ghost users encontrados: ${totalGhostUsers}`);
  console.log(`Total que requieren revision manual: ${totalWithRelations}`);
  console.log(`Total seguros a borrar: ${totalGhostUsers - totalWithRelations}`);
  
  console.log('\n--- CANDIDATOS FANTASMA ---');
  candidates.forEach(c => {
    const subInfo = c.subcollections.map(s => `${s.name}(${s.count})`).join(', ');
    console.log(`ID: ${c.uid} | Subcolecciones: ${subInfo || 'Ninguna'} | Review Manual: ${c.needs_manual_review ? 'SI (' + c.relations.join(', ') + ')' : 'NO'}`);
  });

  const reportPath = path.resolve(process.cwd(), 'ghost_users_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`\nReporte exportado a: ${reportPath}`);
}

auditGhostUsers().catch(console.error);
