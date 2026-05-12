import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

async function completeProfile() {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-adminsdk.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    try { getApp(); } catch { initializeApp({ credential: cert(serviceAccount) }); }

    const db = getFirestore();
    const email = "smoke_test_pasajero_final@vamo.app";
    
    const snapshot = await db.collection('users').where('email', '==', email).get();
    
    if (snapshot.empty) return;

    const userDoc = snapshot.docs[0];
    await userDoc.ref.update({
        registrationStatus: 'active',
        profileCompleted: true,
        phone: '2804000000',
        displayName: 'Smoke Test',
        name: 'Smoke',
        surname: 'Test',
        gender: 'male',
        cityKey: 'rawson',
        updatedAt: new Date()
    });

    console.log("✅ Profile marked as ACTIVE for re-entry test.");
}

completeProfile();
