
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function findAdmin() {
    const snap = await db.collection('users').where('role', '==', 'admin').limit(5).get();
    if (snap.empty) {
        console.log('No admin users found.');
        return;
    }
    snap.forEach(doc => {
        console.log('Admin User:', doc.id, doc.data().email);
    });
}

findAdmin().catch(console.error);
