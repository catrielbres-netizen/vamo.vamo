
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('./service-account.json'),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

async function activate() {
    const db = admin.firestore();
    const config = {
        enabled: true,
        beta: true,
        cities: ["rawson", "playa-union", "playa_union"], 
        requireAlphaTester: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log("🚀 Updating features/sharedRide config (multi-key support):", config);
    
    await db.collection('features').doc('sharedRide').set(config, { merge: true });
    
    console.log("✅ Config successfully updated in Firestore.");
}

activate().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
