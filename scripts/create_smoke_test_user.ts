
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('./service-account.json'),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

async function createSmokeTestUser() {
    const auth = admin.auth();
    const db = admin.firestore();
    const email = 'smoketest_passenger@vamo.com';
    const password = 'VamO2024smoke!';

    console.log("🚀 Creating smoke test user...");

    let user;
    try {
        user = await auth.getUserByEmail(email);
        console.log("User already exists, updating profile...");
    } catch (e) {
        user = await auth.createUser({
            email,
            password,
            displayName: 'Smoke Test Passenger'
        });
        console.log("User created.");
    }

    const profile = {
        uid: user.uid,
        email,
        name: 'Smoke',
        surname: 'Test',
        displayName: 'Smoke T.',
        role: 'passenger',
        profileCompleted: true,
        approved: true,
        registrationStatus: 'active',
        cityKey: 'rawson', // Main testing city
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(user.uid).set(profile, { merge: true });
    console.log("✅ Smoke test user profile active and ready.");
    console.log(`Credentials: ${email} / ${password}`);
}

createSmokeTestUser().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
