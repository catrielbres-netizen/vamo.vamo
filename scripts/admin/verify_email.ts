import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Path to service account (using the one found in root)
const serviceAccountPath = path.join(process.cwd(), 'firebase-adminsdk.json');

async function verifyEmail(identifier: string) {
    console.log(`\n🚀 Starting manual verification process for: ${identifier}...`);

    if (!fs.existsSync(serviceAccountPath)) {
        console.error(`❌ ERROR: Service account not found at ${serviceAccountPath}`);
        console.log("💡 Please ensure 'firebase-adminsdk.json' is present in the root directory.");
        process.exit(1);
    }

    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath)
            });
        }
        console.log("✅ Firebase Admin initialized.");
    } catch (error: any) {
        console.error("❌ Failed to initialize Admin SDK:", error.message);
        process.exit(1);
    }

    const auth = admin.auth();
    const db = admin.firestore();

    try {
        // 1. Search for user
        let userRecord: admin.auth.UserRecord;
        if (identifier.includes('@')) {
            console.log(`🔍 Searching user by EMAIL: ${identifier}`);
            userRecord = await auth.getUserByEmail(identifier);
        } else {
            console.log(`🔍 Searching user by UID: ${identifier}`);
            userRecord = await auth.getUser(identifier);
        }

        const uid = userRecord.uid;

        // 2. Show current state
        console.log("\n📊 CURRENT STATE (Firebase Auth):");
        console.log(`- UID: ${userRecord.uid}`);
        console.log(`- Email: ${userRecord.email}`);
        console.log(`- emailVerified: ${userRecord.emailVerified}`);
        console.log(`- disabled: ${userRecord.disabled}`);

        // 3. Execute update in Firebase Auth
        console.log("\n🔐 Executing admin.auth().updateUser(uid, { emailVerified: true })...");
        await auth.updateUser(uid, {
            emailVerified: true
        });

        // 4. Update mirror fields in Firestore
        console.log("📄 Checking Firestore document users/{uid}...");
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            console.log("📝 Updating Firestore mirror fields (emailVerified, emailVerifiedAt, emailVerificationSource)...");
            await userRef.update({
                emailVerified: true,
                emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                emailVerificationSource: "admin_manual"
            });
            console.log("✅ Firestore document updated successfully.");
        } else {
            console.log("⚠️  Warning: users/{uid} document NOT found in Firestore. Skipping mirror update.");
        }

        // 5. Fetch and show final state
        const updatedUser = await auth.getUser(uid);
        console.log("\n📊 FINAL STATE (Firebase Auth):");
        console.log(`- UID: ${updatedUser.uid}`);
        console.log(`- Email: ${updatedUser.email}`);
        console.log(`- emailVerified: ${updatedUser.emailVerified}`);
        console.log(`- disabled: ${updatedUser.disabled}`);

        console.log("\n🎉 SUCCESS! Driver email has been manually verified.");
        process.exit(0);

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ Error: User ${identifier} not found in Firebase Auth.`);
        } else {
            console.error("❌ FAILED:", error.message);
        }
        process.exit(1);
    }
}

// Get argument from CLI
const input = process.argv[2];
if (!input) {
    console.error("❌ ERROR: Please provide an email or UID as an argument.");
    console.log("Usage: npx tsx scripts/admin/verify_email.ts <email|uid>");
    process.exit(1);
}

verifyEmail(input);
