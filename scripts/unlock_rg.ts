import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function unlockCity() {
    console.log("Desbloqueando Río Gallegos en Firestore para pasajeros...");

    const cityRef = db.doc('cities/rio_gallegos');
    
    // Check if doc exists, if not create it
    const snap = await cityRef.get();
    if (!snap.exists) {
        console.log("El documento de la ciudad no existía, creándolo...");
        await cityRef.set({
            name: "Río Gallegos",
            key: "rio_gallegos",
            operationalStatus: "active",
            passengerAccess: {
                enabled: true
            },
            driverRecruitment: {
                targetApprovedDrivers: 50,
                approvedDriversCount: 0
            }
        });
    } else {
        console.log("Actualizando documento existente...");
        await cityRef.update({
            operationalStatus: "active",
            "passengerAccess.enabled": true
        });
    }

    console.log(`¡Río Gallegos desbloqueado con éxito!`);
    process.exit(0);
}

unlockCity().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
