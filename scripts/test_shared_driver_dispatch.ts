import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('No service account found!');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const EDUARDO_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

async function diagnose() {
    console.log("=== DIAGNÓSTICO DE CONDUCTOR EDUARDO ===");
    const driverSnap = await db.doc(`users/${EDUARDO_UID}`).get();
    if (!driverSnap.exists) {
        console.log("Driver Eduardo no existe.");
    } else {
        const d = driverSnap.data() as any;
        console.log(`UID: ${EDUARDO_UID}`);
        console.log(`Role: ${d.role}`);
        console.log(`cityKey: ${d.cityKey}`);
        console.log(`approved: ${d.approved}`);
        console.log(`driverStatus: ${d.driverStatus}`);
        console.log(`activeRideId: ${d.activeRideId}`);
        console.log(`vehicleCapacity: ${d.vehicleCapacity}`);
        console.log(`serviceType: ${d.serviceType}`);
        console.log(`location: ${JSON.stringify(d.location)}`);
    }

    console.log("\n=== ESTADO DE FEATURES/SHARED_RIDE ===");
    try {
        console.log("Activando driverSearchEnabled en features/sharedRide...");
        await admin.firestore().doc('features/sharedRide').update({ driverSearchEnabled: true });
        
        const sharedRideConfigSnap = await admin.firestore().doc('features/sharedRide').get();
        console.log("=== ESTADO DE FEATURES/SHARED_RIDE ===");
        console.log(sharedRideConfigSnap.data());
    } catch (error) {
        console.log("No existe features/sharedRide");
    }

    console.log("\n=== ÚLTIMO GRUPO COMPARTIDO ===");
    const groupsSnap = await db.collection('shared_ride_groups')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
    
    if (groupsSnap.empty) {
        console.log("No hay grupos compartidos.");
    } else {
        const g = groupsSnap.docs[0].data() as any;
        console.log(`groupId: ${groupsSnap.docs[0].id}`);
        console.log(`status: ${g.status}`);
        console.log(`occupiedSeats: ${g.occupiedSeats}`);
        console.log(`cityKey: ${g.cityKey}`);
        console.log(`estimatedSharedTotal: ${g.estimatedSharedTotal}`);
        console.log(`estimatedDriverTotal: ${g.estimatedDriverTotal}`);
        console.log(`driverBenefitAmount: ${g.driverBenefitAmount}`);
        console.log(`orderedStops:`, JSON.stringify(g.orderedStops, null, 2));
        console.log(`driverSearchStartedAt: ${g.driverSearchStartedAt?.toDate()}`);
        console.log(`driverSearchStatus: ${g.driverSearchStatus}`);
        console.log(`candidateDrivers: ${g.candidateDrivers}`);
        console.log(`assignedDriverId: ${g.assignedDriverId}`);
        console.log(`driverSearchBlockedReason: ${g.driverSearchBlockedReason}`);
        
        console.log("\nRe-despachando el grupo...");
        await admin.firestore().doc(`shared_ride_groups/${groupsSnap.docs[0].id}`).update({
            status: 'ready_for_driver_dispatch',
            driverSearchBlockedReason: admin.firestore.FieldValue.delete()
        });
        console.log("¡Grupo enviado a despacho!");
    }
}

diagnose().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
