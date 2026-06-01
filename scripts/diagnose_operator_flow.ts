import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function runDiagnostics() {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();
        const auth = admin.auth();

        const email = 'catrielbres@gmail.com';
        console.log(`==================================================`);
        console.log(`🔍 RUNNING OPERATOR DIAGNOSTICS FOR: ${email}`);
        console.log(`==================================================\n`);

        // 1. Verify in Auth
        console.log(`Step 1 & 2: Checking Firebase Auth...`);
        let authUser;
        try {
            authUser = await auth.getUserByEmail(email);
            console.log(`✅ Auth user found!`);
            console.log(`   - Email: ${authUser.email}`);
            console.log(`   - UID: ${authUser.uid}`);
            console.log(`   - Disabled: ${authUser.disabled}`);
        } catch (authErr: any) {
            console.error(`❌ Auth user not found:`, authErr.message);
            return;
        }

        const uid = authUser.uid;

        // 4. Verify users/{uid} exists
        console.log(`\nStep 4 & 5: Checking Firestore document users/${uid}...`);
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            console.error(`❌ Document users/${uid} does NOT exist in Firestore!`);
            return;
        }
        console.log(`✅ Firestore users/${uid} document exists!`);
        const userData = userDoc.data() || {};
        console.log(`   - Fields:`);
        console.log(`     * role: ${JSON.stringify(userData.role)}`);
        console.log(`     * cityKey: ${JSON.stringify(userData.cityKey)}`);
        console.log(`     * stationId: ${JSON.stringify(userData.stationId)}`);
        console.log(`     * stationName: ${JSON.stringify(userData.stationName)}`);
        console.log(`     * mustChangePassword: ${JSON.stringify(userData.mustChangePassword)}`);
        console.log(`     * isSuspended: ${JSON.stringify(userData.isSuspended)}`);

        // 6. Verify role == "station_operator"
        console.log(`\nStep 6: Verifying role is "station_operator"...`);
        if (userData.role === 'station_operator') {
            console.log(`✅ Role is correct! ("station_operator")`);
        } else {
            console.error(`❌ Incorrect role! Expected "station_operator", found "${userData.role}"`);
        }

        // 7. Verify stationId exists in user doc
        console.log(`\nStep 7: Verifying stationId is set...`);
        const stationId = userData.stationId;
        if (stationId) {
            console.log(`✅ stationId is set to: "${stationId}"`);
        } else {
            console.error(`❌ stationId is NOT set in users/${uid}!`);
            return;
        }

        // 8. Verify taxi_stands/{stationId} exists
        console.log(`\nStep 8: Verifying document taxi_stands/${stationId} exists...`);
        const standDoc = await db.collection('taxi_stands').doc(stationId).get();
        if (!standDoc.exists) {
            console.error(`❌ Document taxi_stands/${stationId} does NOT exist in Firestore!`);
            return;
        }
        console.log(`✅ Firestore taxi_stands/${stationId} document exists!`);
        const standData = standDoc.data() || {};
        console.log(`   - Fields:`);
        console.log(`     * id: ${JSON.stringify(standData.id)}`);
        console.log(`     * name: ${JSON.stringify(standData.name)}`);
        console.log(`     * operatorUid: ${JSON.stringify(standData.operatorUid)}`);
        console.log(`     * cityKey: ${JSON.stringify(standData.cityKey)}`);
        console.log(`     * isActive: ${JSON.stringify(standData.isActive)}`);

        // 9. Verify taxi_stands/{stationId}.operatorUid == uid
        console.log(`\nStep 9: Verifying operatorUid matches...`);
        if (standData.operatorUid === uid) {
            console.log(`✅ operatorUid matches! ("${uid}")`);
        } else {
            console.error(`❌ operatorUid mismatch! taxi_stands doc operatorUid is "${standData.operatorUid}", but auth UID is "${uid}"`);
        }

        // 11. Regenerate secure temp password
        console.log(`\nStep 11: Regenerating temporary password...`);
        const tempPassword = "VamO!" + Math.random().toString(36).slice(-8) + Math.random().toString(36).toUpperCase().slice(-8);
        await auth.updateUser(uid, {
            password: tempPassword
        });
        await db.collection('users').doc(uid).update({
            mustChangePassword: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Successfully updated Firebase Auth and Firestore with new password!`);
        console.log(`\n==================================================`);
        console.log(`🎉 READY FOR TESTING`);
        console.log(`==================================================`);
        console.log(`Email: ${email}`);
        console.log(`Password: ${tempPassword}`);
        console.log(`UID: ${uid}`);
        console.log(`Station ID: ${stationId}`);
        console.log(`Station Name: ${userData.stationName}`);
        console.log(`==================================================\n`);

    } catch (e: any) {
        console.error("❌ Exception during diagnostics:", e.message);
    }
}

runDiagnostics();
