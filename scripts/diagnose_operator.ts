import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function diagnose() {
    console.log("🔍 Running Operator Diagnosis for stand_5ea644ac...");
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();
        const auth = admin.auth();

        // 1. Get stand
        const standId = 'stand_5ea644ac';
        const standSnap = await db.collection('taxi_stands').doc(standId).get();
        if (!standSnap.exists) {
            console.error(`❌ Taxi Stand ${standId} does not exist in Firestore!`);
            return;
        }

        const standData = standSnap.data() || {};
        console.log("🚏 STAND INFO:");
        console.log("- ID:", standId);
        console.log("- Name:", standData.name);
        console.log("- City Key:", standData.cityKey);
        console.log("- Operator UID:", standData.operatorUid);
        console.log("- Representative Email:", standData.representativeEmail);

        if (!standData.operatorUid) {
            console.log("⚠️ No operatorUid is assigned to this stand yet.");
            return;
        }

        // 2. Get user profile
        const userSnap = await db.collection('users').doc(standData.operatorUid).get();
        if (!userSnap.exists) {
            console.log(`❌ User profile for UID ${standData.operatorUid} does not exist in users collection!`);
        } else {
            const userData = userSnap.data() || {};
            console.log("\n📄 USER PROFILE INFO:");
            console.log("- UID:", userData.uid);
            console.log("- Email:", userData.email);
            console.log("- Role:", userData.role);
            console.log("- Station ID:", userData.stationId);
            console.log("- Station Name:", userData.stationName);
            console.log("- Is Suspended:", userData.isSuspended);
        }

        // 3. Get Auth record
        try {
            const authUser = await auth.getUser(standData.operatorUid);
            console.log("\n🔑 AUTH USER INFO:");
            console.log("- UID:", authUser.uid);
            console.log("- Email:", authUser.email);
            console.log("- Disabled:", authUser.disabled);
            console.log("- Email Verified:", authUser.emailVerified);
            console.log("- Custom Claims:", JSON.stringify(authUser.customClaims, null, 2));
        } catch (e: any) {
            console.error(`❌ Could not fetch auth user for UID ${standData.operatorUid}:`, e.message);
        }

    } catch (e: any) {
        console.error("❌ Diagnostic error:", e.message);
    }
}

diagnose();
