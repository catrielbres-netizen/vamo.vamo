import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function check() {
    const doc = await db.doc('cities/rio_gallegos').get();
    console.log("Document exists:", doc.exists);
    if (doc.exists) {
        console.log(JSON.stringify(doc.data(), null, 2));
    }
    process.exit(0);
}

check();
