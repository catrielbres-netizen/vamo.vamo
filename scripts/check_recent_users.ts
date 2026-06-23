import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkUsers() {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(5).get();
    snap.forEach(doc => {
        console.log("User:", doc.id);
        console.log("Email:", doc.data().email);
        console.log("CityKey:", doc.data().cityKey);
        console.log("Role:", doc.data().role);
        console.log("---");
    });
    process.exit(0);
}

checkUsers();
