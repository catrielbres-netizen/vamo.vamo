import * as admin from 'firebase-admin';

// Reemplazar con el path al serviceAccountKey.json o usar export GOOGLE_APPLICATION_CREDENTIALS=...
try {
    const serviceAccount = require('../../serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    admin.initializeApp();
}

const db = admin.firestore();

async function main() {
    console.log("Encolando email de prueba...");
    
    const docData = {
        to: "cesareduardobres@gmail.com",
        template: "driver_registration_created",
        subject: "Tu registro en VamO fue creado",
        data: {
            name: "Eduardo",
            cityName: "Rawson"
        },
        status: "pending",
        attempts: 0,
        provider: "resend",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        sentAt: null,
        error: null,
        dedupeKey: `driver_registration_created_test_${Date.now()}`
    };

    const docRef = await db.collection('mail_queue').add(docData);
    
    console.log(`Email de prueba encolado con ID: ${docRef.id}`);
    process.exit(0);
}

main().catch(console.error);
