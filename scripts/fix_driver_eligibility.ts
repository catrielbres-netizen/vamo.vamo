import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Load environment from .env.local to get project ID
dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

console.log(`📡 Connecting to Firebase project: ${projectId}`);

// Initialize Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: projectId,
  });
}

const db = getFirestore();
const emailToFix = 'gp1877774@gmail.com';

async function fixDriver() {
  console.log(`🔍 Searching for user with email: ${emailToFix}...`);

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', emailToFix).get();

    if (snapshot.empty) {
      console.error(`❌ No user found with email: ${emailToFix}`);
      process.exit(1);
    }

    const userDoc = snapshot.docs[0];
    const uid = userDoc.id;
    const userData = userDoc.data();

    console.log(`✅ Found user: ${userData.name || 'Unknown'} (UID: ${uid})`);
    console.log(`🛠️ Current status: role=${userData.role}, approved=${userData.approved}, profileCompleted=${userData.profileCompleted}`);

    const updates: any = {
      termsAccepted: true,
      termsVersion: "v1.2",
      termsAcceptedAt: FieldValue.serverTimestamp(),
      approved: true,
      profileCompleted: true,
      emailVerified: true,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Prevent driverStatus from staying in an invalid "inactive" state if present
    if (userData.driverStatus === 'inactive') {
      updates.driverStatus = 'offline';
    }

    // Handle Express municipality status
    if (userData.driverSubtype === 'express') {
      console.log(`🚚 User is an EXPRESS driver. Setting municipalStatus to active...`);
      updates.municipalStatus = 'active';
    }

    console.log(`💾 Applying updates...`);
    await usersRef.doc(uid).update(updates);

    // Fetch final state for confirmation
    const updatedDoc = await usersRef.doc(uid).get();
    const finalData = updatedDoc.data();

    console.log('\n--- FINAL DOCUMENT VALUES ---');
    console.log(`UID: ${uid}`);
    console.log(`termsAccepted: ${finalData?.termsAccepted}`);
    console.log(`termsVersion: ${finalData?.termsVersion}`);
    console.log(`approved: ${finalData?.approved}`);
    console.log(`profileCompleted: ${finalData?.profileCompleted}`);
    console.log(`emailVerified: ${finalData?.emailVerified}`);
    console.log(`municipalStatus: ${finalData?.municipalStatus || 'N/A'}`);
    console.log(`driverStatus: ${finalData?.driverStatus}`);
    console.log('------------------------------\n');

    console.log('✅ Update completed successfully!');
    
    // Simulate eligibility check
    const CURRENT_TERMS_VERSION = "v1.2";
    const isEligible = 
        finalData?.role === 'driver' &&
        finalData?.approved === true &&
        finalData?.profileCompleted === true &&
        finalData?.termsAccepted === true &&
        finalData?.termsVersion === CURRENT_TERMS_VERSION &&
        (finalData?.driverSubtype !== 'express' || finalData?.municipalStatus === 'active');

    if (isEligible) {
        console.log('🚀 ELIGIBILITY CHECK: PASSED. The user can now go online.');
    } else {
        console.warn('⚠️ ELIGIBILITY CHECK: FAILED. Check the values above.');
    }

  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
}

fixDriver();
