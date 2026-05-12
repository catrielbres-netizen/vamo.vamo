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

async function checkSpecificRide() {
    // List all docs in rides collection and filter by doc.id in memory
    const snap = await db.collection('rides').limit(100).get();
    console.log(`Checking 100 rides for 'test_fraud' prefix...`);
    snap.forEach(doc => {
        if (doc.id.startsWith('test_fraud')) {
            console.log(`[FOUND] ${doc.id} - status: ${doc.data().status}`);
        }
    });
}

checkSpecificRide().catch(console.error);
