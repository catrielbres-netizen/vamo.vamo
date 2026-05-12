import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

async function verifyOnboarding() {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-adminsdk.json');
    if (!fs.existsSync(serviceAccountPath)) {
        console.error("Missing firebase-adminsdk.json");
        return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    try {
        getApp();
    } catch {
        initializeApp({
            credential: cert(serviceAccount)
        });
    }

    const db = getFirestore();
    const email = "smoke_test_pasajero_final@vamo.app";
    
    console.log(`\n--- AUDIT: ${email} ---`);
    
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    
    if (snapshot.empty) {
        console.log("❌ User not found in Firestore.");
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log("UID:", doc.id);
        console.log("Role:", data.role);
        console.log("RegistrationStatus:", data.registrationStatus);
        console.log("ProfileCompleted:", data.profileCompleted);
        console.log("TermsAccepted:", data.termsAccepted);
        console.log("TermsAcceptedAt:", data.termsAcceptedAt?.toDate?.() || data.termsAcceptedAt);
        console.log("Phone:", data.phone);
        console.log("DisplayName:", data.displayName);
    });
}

verifyOnboarding();
