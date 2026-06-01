
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Path to service account (Please ensure this file exists in the root)
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const adminEmail = 'admin@gmail.com';

async function verifyAdmin() {
    console.log(`🚀 Starting verification for ${adminEmail}...`);

    if (!fs.existsSync(serviceAccountPath)) {
        console.error(`❌ ERROR: Service account not found at ${serviceAccountPath}`);
        console.log("💡 Please ensure the JSON file is present or update the path in the script.");
        process.exit(1);
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        console.log("✅ Firebase Admin initialized.");
    } catch (error: any) {
        console.error("❌ Failed to initialize Admin SDK:", error.message);
        process.exit(1);
    }

    const auth = admin.auth();
    const db = admin.firestore();

    try {
        // 1. Find User
        console.log(`🔍 Looking for user ${adminEmail}...`);
        const userRecord = await auth.getUserByEmail(adminEmail);
        const uid = userRecord.uid;
        console.log(`✅ Found user: ${uid}`);

        // 2. Update Auth State
        console.log("🔐 Marking email as verified and enabling account...");
        await auth.updateUser(uid, {
            emailVerified: true,
            disabled: false
        });

        // 3. Set Custom Claims
        console.log("🔑 Setting Admin Custom Claims...");
        await auth.setCustomUserClaims(uid, {
            r: 'admin',
            v: 1
        });

        // 4. Update Firestore Profile (just in case)
        console.log("📄 Updating Firestore profile...");
        await db.collection('users').doc(uid).set({
            role: 'admin',
            emailVerified: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log("\n🎉 SUCCESS! admin@gmail.com is now fully verified and authorized.");
        console.log("You can now log in normally through the standard flow.");
        process.exit(0);

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ User ${adminEmail} does not exist in Firebase Auth.`);
        } else {
            console.error("❌ FAILED:", error.message);
        }
        process.exit(1);
    }
}

verifyAdmin();
