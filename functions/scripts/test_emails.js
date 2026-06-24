const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function run() {
    console.log("Creando emails de prueba...");

    const testEmails = [
        { email: 'pasajero1.test@vamoapp.com.ar', role: 'passenger', name: 'Pasajero Uno' },
        { email: 'pasajero2.test@vamoapp.com.ar', role: 'passenger', name: 'Pasajero Dos' },
        { email: 'conductor1.test@vamoapp.com.ar', role: 'driver', name: 'Conductor Uno' },
        { email: 'conductor2.test@vamoapp.com.ar', role: 'driver', name: 'Conductor Dos' },
    ];

    for (const testUser of testEmails) {
        let template = testUser.role === 'passenger' ? 'passenger_launch_0d' : 'driver_launch_0d';
        let subject = testUser.role === 'passenger' ? '¡VamO ya está activo! (TEST)' : '¡Ya podés conectarte a VamO! (TEST)';

        await db.collection('mail_queue').add({
            to: testUser.email,
            template: template,
            subject: subject,
            data: { name: testUser.name },
            status: 'pending',
            attempts: 0,
            provider: 'resend',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sentAt: null,
            error: null,
            dedupeKey: `test_launch_script_${new Date().getTime()}_${testUser.email}`
        });

        console.log(`Encolado email de prueba para ${testUser.role} -> ${testUser.email}`);
    }

    console.log("¡Prueba encolada! Ver logs de Cloud Functions para confirmar ruteo.");
    process.exit(0);
}

run().catch(console.error);
