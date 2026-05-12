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

async function checkLedger() {
    const snap = await db.collection('ledger_events').orderBy('createdAt', 'desc').limit(10).get();
    console.log(`Found ${snap.size} ledger events.`);
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`[${data.eventType}] actor: ${data.actorId} - ${data.rideId || ''}`);
    });

    const alertsSnap = await db.collection('fraud_alerts').orderBy('createdAt', 'desc').limit(5).get();
    console.log(`Found ${alertsSnap.size} fraud alerts.`);
    alertsSnap.forEach(doc => {
        const data = doc.data();
        console.log(`[ALERT] type: ${data.type} - score: ${data.score} - ride: ${data.rideId}`);
    });
}

checkLedger().catch(console.error);
