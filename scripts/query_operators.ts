import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function listOperators() {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();

        console.log("📋 FETCHING ALL STATION OPERATORS...");
        const snap = await db.collection('users').where('role', '==', 'station_operator').get();
        
        if (snap.empty) {
            console.log("⚠️ No station operators found in the users collection.");
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            console.log(`\n👤 OPERATOR [UID: ${doc.id}]:`);
            console.log(`- Email: ${data.email}`);
            console.log(`- Role: ${data.role}`);
            console.log(`- Station ID: ${data.stationId}`);
            console.log(`- Station Name: ${data.stationName}`);
            console.log(`- Is Suspended: ${data.isSuspended}`);
        });

    } catch (e: any) {
        console.error("❌ Error listing operators:", e.message);
    }
}

listOperators();
