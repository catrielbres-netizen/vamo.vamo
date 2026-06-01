import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function diagnoseEmail() {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();
        const auth = admin.auth();

        const targetEmail = 'catrielbres@gmail.com';
        console.log(`🔍 DIAGNOSING EMAIL: ${targetEmail}`);

        // 1. Check Auth
        let authUser;
        try {
            authUser = await auth.getUserByEmail(targetEmail);
            console.log("\n🔑 FIREBASE AUTH RECORD:");
            console.log("- UID:", authUser.uid);
            console.log("- Display Name:", authUser.displayName);
            console.log("- Disabled:", authUser.disabled);
            console.log("- Custom Claims:", JSON.stringify(authUser.customClaims, null, 2));
        } catch (err: any) {
            console.log("❌ Auth user not found for email:", targetEmail, err.message);
        }

        // 2. Query Firestore users collection for this email
        console.log("\n📄 FIRESTORE USERS WITH THIS EMAIL:");
        const usersSnap = await db.collection('users').where('email', '==', targetEmail).get();
        if (usersSnap.empty) {
            console.log("No user profiles found with this email.");
        } else {
            usersSnap.forEach(doc => {
                const data = doc.data();
                console.log(`- Document ID (UID): ${doc.id}`);
                console.log(`  Name: ${data.name}`);
                console.log(`  Role: ${data.role}`);
                console.log(`  Station ID: ${data.stationId}`);
                console.log(`  Station Name: ${data.stationName}`);
                console.log(`  City: ${data.city || data.cityKey}`);
                console.log(`  Approved: ${data.approved}`);
            });
        }

    } catch (e: any) {
        console.error("❌ Diagnostic error:", e.message);
    }
}

diagnoseEmail();
