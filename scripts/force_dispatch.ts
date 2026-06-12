import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function run() {
    console.log("Despachando forzadamente...");
    const db = admin.firestore();
    const groupId = 'xz0OmE0a5xi2nzle0lbT';
    
    // We update features to ensure the watchdog/trigger sees driverSearchEnabled: true
    await db.doc('features/sharedRide').update({ driverSearchEnabled: true });

    // Set to pending
    await db.doc(`shared_ride_groups/${groupId}`).update({
        status: 'pending_for_dispatch_test'
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Set to ready_for_driver_dispatch to trigger the newly deployed onSharedRideGroupUpdateV1
    await db.doc(`shared_ride_groups/${groupId}`).update({
        status: 'ready_for_driver_dispatch',
        driverSearchBlockedReason: admin.firestore.FieldValue.delete()
    });
    
    console.log("Trigger activado, esperando 5 segundos...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const offers = await db.collection('rideOffers').where('sharedGroupId', '==', groupId).get();
    if(offers.empty) {
        console.log("Aún no hay ofertas creadas para este grupo.");
    } else {
        const o = offers.docs[0].data();
        console.log("=== OFERTA CREADA ===");
        console.log('ID:', offers.docs[0].id);
        console.log('Driver ID:', o.driverId);
        console.log('Total Bruto (Group):', o.estimatedTotal);
        console.log('Neto Estimado (Driver):', o.estimatedTotal - (o.pricing?.totalCommissions || 0)); // Or something similar, wait we added driverBenefitAmount
        console.log('individualFareReference:', o.individualFareReference);
        console.log('driverBenefitAmount:', o.driverBenefitAmount);
        console.log('Hoja de ruta (orderedStopsPreview):', !!o.orderedStopsPreview, o.orderedStopsPreview?.length, 'paradas');
        console.log('Pasajeros (sharedPassengers):', !!o.sharedPassengers, o.sharedPassengers?.length, 'pasajeros');
    }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
