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

interface Candidate {
  documentId: string;
  uid: string;
  email: string;
  role: string;
  cityKey: string;
  createdAt: any;
  name: string;
  approved: boolean;
  reason: string;
  needs_manual_review: boolean;
  relations: string[];
}

const PROTECTED_EMAILS = [
  'cesareduardobres@gmail.com',
  'admin@gmail.com',
  'adminrawson@gmail.com',
  'adminriogallegos@gmail.com'
];

function isTestString(str: string | undefined | null): boolean {
  if (!str) return false;
  return str.toLowerCase().includes('test');
}

function isValidEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

async function audit() {
  console.log('--- INICIANDO AUDITORIA DE USUARIOS ---');

  const usersSnap = await db.collection('users').get();
  
  let totalUsers = 0;
  let totalWithValidEmail = 0;
  let totalWithoutEmail = 0;
  
  const candidates: Candidate[] = [];

  for (const doc of usersSnap.docs) {
    totalUsers++;
    const data = doc.data();
    
    const uid = data.uid || doc.id;
    const email = data.email;
    const role = data.role;
    const name = data.name || data.firstName || data.displayName;
    const isProtectedEmail = email && PROTECTED_EMAILS.includes(email.toLowerCase());
    
    let isCandidate = false;
    let reason = '';

    if (email) {
      if (isValidEmail(email)) {
        totalWithValidEmail++;
      } else {
        totalWithoutEmail++;
      }
    } else {
      totalWithoutEmail++;
    }

    // Protection checks first
    const isProtectedRole = ['admin', 'superadmin', 'municipal', 'traffic'].includes(role);
    const isExplicitlyTest = isTestString(email) || isTestString(name) || (uid && uid.startsWith('test_'));

    if (isProtectedEmail) {
      continue;
    }

    if (isProtectedRole && !isExplicitlyTest) {
      continue;
    }

    // Candidate selection logic
    if (!email || email === '' || email === null) {
      isCandidate = true;
      reason = 'No email or empty email';
    } else if (!isValidEmail(email)) {
      isCandidate = true;
      reason = 'Invalid email format';
    } else if (!uid) {
      isCandidate = true;
      reason = 'Missing uid';
    } else if (!role) {
      isCandidate = true;
      reason = 'Missing role';
    } else if (isExplicitlyTest) {
      isCandidate = true;
      reason = 'Identified as test user (email, name, or uid)';
    }

    if (isCandidate) {
      // Check relations
      let needs_manual_review = false;
      const relations: string[] = [];

      // Documents subcollection
      const docsSnap = await db.collection(`users/${doc.id}/documents`).limit(1).get();
      if (!docsSnap.empty) {
        relations.push('documents subcollection');
      }
      
      // Legal acceptances subcollection
      const legalSnap = await db.collection(`users/${doc.id}/legal_acceptances`).limit(1).get();
      if (!legalSnap.empty) {
        relations.push('legal_acceptances subcollection');
      }

      // Wallet collection
      const walletSnap = await db.collection('wallets').doc(doc.id).get();
      if (walletSnap.exists) {
        relations.push('wallet');
        needs_manual_review = true;
      }

      // Rides (passenger or driver)
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

      // Withdrawal requests
      const withdrawals = await db.collection('withdrawal_requests').where('userId', '==', uid).limit(1).get();
      if (!withdrawals.empty) {
        relations.push('withdrawal_requests');
        needs_manual_review = true;
      }
      
      candidates.push({
        documentId: doc.id,
        uid: uid,
        email: email,
        role: role,
        cityKey: data.cityKey,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null,
        name: name,
        approved: data.approved,
        reason: reason,
        needs_manual_review: needs_manual_review,
        relations: relations
      });
    }
  }

  const totalCandidates = candidates.length;
  const totalNeedsReview = candidates.filter(c => c.needs_manual_review).length;

  console.log('--- REPORTE DE AUDITORIA ---');
  console.log(`Total de usuarios analizados: ${totalUsers}`);
  console.log(`Total con email valido: ${totalWithValidEmail}`);
  console.log(`Total sin email (o invalido): ${totalWithoutEmail}`);
  console.log(`Total candidatos a borrar: ${totalCandidates}`);
  console.log(`Total que requieren revision manual: ${totalNeedsReview}`);
  
  console.log('\n--- CANDIDATOS A BORRAR ---');
  candidates.forEach(c => {
    console.log(`ID: ${c.documentId} | Email: ${c.email} | Motivo: ${c.reason} | Review Manual: ${c.needs_manual_review ? 'SI (' + c.relations.join(', ') + ')' : 'NO'}`);
  });

  const reportPath = path.resolve(process.cwd(), 'user_cleanup_candidates.json');
  fs.writeFileSync(reportPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`\nReporte exportado a: ${reportPath}`);
}

audit().catch(console.error);
