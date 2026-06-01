import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function getOperatorDoc() {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();

        const uid = 'pHqHpcYI4dXs19Pl0NyEJC8cKHj1';
        console.log(`🔍 Fetching users/${uid} from Firestore...`);
        const userDoc = await db.doc(`users/${uid}`).get();
        if (userDoc.exists) {
            console.log(`✅ Document exists!`);
            console.log(JSON.stringify(userDoc.data(), null, 2));
        } else {
            console.log(`❌ Document does NOT exist!`);
        }

    } catch (e: any) {
        console.error("❌ Error fetching document:", e.message);
    }
}

getOperatorDoc();
