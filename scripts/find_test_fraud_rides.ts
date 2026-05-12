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

async function findTestRides() {
    const snap = await db.collection('rides')
        .where('id', '>=', 'test_fraud')
        .where('id', '<=', 'test_fraud\uf8ff')
        .get();
    
    console.log(`Found ${snap.size} test fraud rides.`);
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`[${doc.id}] status: ${data.status} - isSim: ${data.isSimulation}`);
    });
}

findTestRides().catch(console.error);
