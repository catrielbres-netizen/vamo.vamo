
import admin from 'firebase-admin';

// This script uses GOOGLE_APPLICATION_CREDENTIALS environment variable
// or standard Firebase Admin initialization if available.

async function fixAdmin() {
    const adminEmail = 'admin@gmail.com';
    console.log(`🚀 Starting Professional Fix for ${adminEmail}...`);

    try {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        console.log("✅ Firebase Admin initialized.");
    } catch (error: any) {
        console.error("❌ Failed to initialize Admin SDK. Ensure GOOGLE_APPLICATION_CREDENTIALS is set to a valid JSON file.");
        console.log("Current ENV GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
        process.exit(1);
    }

    const auth = admin.auth();
    const db = admin.firestore();

    try {
        // 1. Audit Current State
        console.log(`🔍 Auditing user ${adminEmail}...`);
        const userRecord = await auth.getUserByEmail(adminEmail);
        const uid = userRecord.uid;

        console.log("-----------------------------------------");
        console.log("AUTH AUDIT:");
        console.log(`- UID: ${uid}`);
        console.log(`- Email Verified: ${userRecord.emailVerified}`);
        console.log(`- Disabled: ${userRecord.disabled}`);
        console.log(`- Custom Claims: ${JSON.stringify(userRecord.customClaims)}`);
        console.log("-----------------------------------------");

        // 2. Force Verification and Enable
        console.log("🔐 Forcing emailVerified: true and disabled: false...");
        await auth.updateUser(uid, {
            emailVerified: true,
            disabled: false
        });

        // 3. Set/Update Custom Claims
        console.log("🔑 Setting Custom Claims { r: 'admin', role: 'admin', v: 1 }...");
        await auth.setCustomUserClaims(uid, {
            r: 'admin',
            role: 'admin',
            v: 1
        });

        // 4. Synchronize Firestore Profile
        console.log("📄 Synchronizing Firestore profile document...");
        const userRef = db.collection('users').doc(uid);
        
        await userRef.set({
            uid,
            id: uid,
            email: adminEmail,
            role: 'admin',
            emailVerified: true,
            approved: true,
            profileCompleted: true,
            registrationStatus: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log("✅ Firestore document synchronized.");

        // 5. Final Verify
        const updatedRecord = await auth.getUserByEmail(adminEmail);
        console.log("-----------------------------------------");
        console.log("FINAL STATE:");
        console.log(`- Email Verified: ${updatedRecord.emailVerified}`);
        console.log(`- Custom Claims: ${JSON.stringify(updatedRecord.customClaims)}`);
        console.log("-----------------------------------------");

        console.log("\n🎉 SUCCESS! admin@gmail.com is now fully normalized.");
        console.log("💡 IMPORTANT: On the frontend, sign out and sign back in, or run:");
        console.log("   await auth.currentUser?.reload();");
        console.log("   await auth.currentUser?.getIdToken(true);");
        
        process.exit(0);

    } catch (error: any) {
        console.error("❌ FAILED:", error.message);
        process.exit(1);
    }
}

fixAdmin();
