import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function fix() {
    await db.collection('users').doc('kLH80TIZmkh4WKuw4rot7O7lxEi1').update({
        cityKey: 'rio_gallegos'
    });
    console.log("Fixed pasajero.rg1");
    process.exit(0);
}

fix();
