import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    try {
        const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
        if (fs.existsSync(firebasercPath)) {
            const rc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
            projectId = rc.projects?.default;
        }
    } catch (e) {}
}

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

async function testUserAudit() {
    const userId = `test_user_audit_${Date.now()}`;
    console.log(`Creating test user ${userId}...`);
    
    await db.collection('users').doc(userId).set({
        name: 'Audit Test User',
        email: 'audit@test.com',
        role: 'passenger',
        cityKey: 'rawson',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Wait 10 seconds for triggers...");
    await new Promise(r => setTimeout(r, 10000));

    const ledgerSnap = await db.collection('ledger_events')
        .where('actorId', '==', userId)
        .get();
    
    if (!ledgerSnap.empty) {
        console.log(`✅ SUCCESS: ${ledgerSnap.size} ledger events found for new user.`);
        ledgerSnap.forEach(doc => console.log(`Event: ${doc.data().eventType}`));
    } else {
        console.log("❌ FAILURE: No ledger events found for new user.");
    }
}

testUserAudit().catch(console.error);
