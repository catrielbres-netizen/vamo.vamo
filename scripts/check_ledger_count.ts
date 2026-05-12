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
    const snap = await db.collection('ledger_events').limit(1).get();
    console.log(`Found ${snap.size} ledger events (any).`);
    
    const countSnap = await db.collection('ledger_events').count().get();
    console.log(`Total ledger events count: ${countSnap.data().count}`);
}

checkLedger().catch(console.error);
