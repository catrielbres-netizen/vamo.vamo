import admin from 'firebase-admin';
import * as fs from 'fs';

const saPath = 'C:/Users/catri/Downloads/studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(sa)
    });
}

const db = admin.firestore();

async function forceComplete(rideId: string, driverId: string) {
    console.log(`🚀 Forzando completitud de viaje ${rideId} con conductor ${driverId}...`);
    
    const rideRef = db.doc(`rides/${rideId}`);
    const driverRef = db.doc(`users/${driverId}`);
    
    // 1. Asignar conductor
    await rideRef.update({
        status: 'assigned',
        driverId: driverId,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await driverRef.update({
        driverStatus: 'in_ride',
        activeRideId: rideId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Conductor asignado.');
    
    // 2. Iniciar viaje
    await rideRef.update({
        status: 'in_ride',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Viaje iniciado.');
    
    // 3. Finalizar viaje
    await rideRef.update({
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Viaje finalizado. Esperando settlement...');
}

const rideId = process.argv[2];
const driverId = 'hBBDZRKgBVQGetjHxZvNFst6pBg1';

if (!rideId) {
    console.error('Uso: npx tsx scripts/force_complete_ride.ts <rideId>');
    process.exit(1);
}

forceComplete(rideId, driverId).catch(console.error);
