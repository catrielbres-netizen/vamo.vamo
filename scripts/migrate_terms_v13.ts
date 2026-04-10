
import * as admin from 'firebase-admin';
import { resolve } from 'path';

// Load service account (assumed to be in local environment or passed via env)
// Note: This script is for the user to run in their controlled environment.
// For safety, it uses a batch approach.

async function migrateDriversToTermsV13() {
  console.log('🚀 Starting Migration: Driver Terms v1.3...');
  
  const db = admin.firestore();
  const usersRef = db.collection('users');
  
  // 1. Fetch drivers who have accepted terms but are missing the specific driver flag
  const snapshot = await usersRef
    .where('role', '==', 'driver')
    .where('termsAccepted', '==', true)
    .get();

  console.log(`🔍 Found ${snapshot.size} drivers to check.`);
  
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    
    // If they have acceptedTerms but miss the new standard flags or version
    if (!data.acceptedDriverTerms || data.termsVersion !== 'v1.3') {
      batch.update(doc.ref, {
        acceptedDriverTerms: true,
        termsVersion: 'v1.3',
        acceptedTermsAt: data.termsAcceptedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`✅ Migration complete. Updated ${count} drivers.`);
  } else {
    console.log('✨ No drivers needed migration.');
  }
}

// Instruction for the user: 
// Run with: ts-node scripts/migrate_terms_v13.ts
// Requires firebase-admin initialized.
