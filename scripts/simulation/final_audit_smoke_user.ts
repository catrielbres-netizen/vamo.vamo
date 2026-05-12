import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

async function finalAudit() {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-adminsdk.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    try { getApp(); } catch { initializeApp({ credential: cert(serviceAccount) }); }

    const db = getFirestore();
    const email = "smoke_test_pasajero_final@vamo.app";
    
    const snapshot = await db.collection('users').where('email', '==', email).get();
    
    if (snapshot.empty) {
        console.log("❌ User not found.");
        return;
    }

    const data = snapshot.docs[0].data();
    console.log("\n--- FINAL FIRESTORE AUDIT ---");
    console.log(`Role: ${data.role} (Expected: passenger)`);
    console.log(`EmailLower: ${data.emailLower} (Expected: smoke_test_pasajero_final@vamo.app)`);
    console.log(`ProfileCompleted: ${data.profileCompleted} (Expected: true)`);
    console.log(`TermsAccepted: ${data.termsAccepted} (Expected: true)`);
    console.log(`RegistrationStatus: ${data.registrationStatus} (Expected: active)`);
    console.log("-----------------------------\n");
}

finalAudit();
