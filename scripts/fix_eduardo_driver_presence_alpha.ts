import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
} catch (e) {}

const db = admin.firestore();

async function runFix() {
    const isDryRun = process.argv.includes('--dry-run');

    console.log("=====================================================");
    console.log(`🛠 FIX PRESENCIA: Conductor Eduardo (Alpha)`);
    console.log(`Modo: ${isDryRun ? "DRY-RUN (Solo Análisis)" : "EXECUTE (Limpieza Real)"}`);
    console.log("=====================================================\n");

    const uid = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    
    // Coordenadas de Rawson (Centro o cerca de Los Sauces)
    const mockLocation = {
        lat: -43.298285, 
        lng: -65.102711 
    };

    const userRef = db.collection('users').doc(uid);
    const locRef = db.collection('drivers_locations').doc(uid);

    const userSnap = await userRef.get();
    const locSnap = await locRef.get();

    const u = userSnap.data();
    const l = locSnap.data();

    console.log(`Estado Actual 'users': location = ${u?.location ? JSON.stringify(u.location) : 'undefined'}`);
    console.log(`Estado Actual 'drivers_locations': lat = ${l?.lat}, lng = ${l?.lng}\n`);

    if (isDryRun) {
        console.log("[DRY-RUN] Cambios propuestos:");
        console.log(`-> En users/${uid}:`);
        console.log(`   - status: 'online'`);
        console.log(`   - driverStatus: 'online'`);
        console.log(`   - isAvailable: true`);
        console.log(`   - location: { lat: ${mockLocation.lat}, lng: ${mockLocation.lng} }`);
        console.log(`   - limpiar activeRideId, currentRideId, activeSharedRideId, etc. (si existieran)`);
        
        console.log(`\n-> En drivers_locations/${uid}:`);
        console.log(`   - lat: ${mockLocation.lat}`);
        console.log(`   - lng: ${mockLocation.lng}`);
        console.log(`   - online: true`);
        console.log(`   - isAvailable: true`);
        console.log(`   - driverStatus: 'online'`);
        console.log(`   - updatedAt: serverTimestamp()`);
        
        console.log("\n[DRY-RUN] No se modificaron datos.");
    } else {
        console.log("[EXECUTE] Aplicando fix...");

        const batch = db.batch();
        const now = admin.firestore.FieldValue.serverTimestamp();

        // Fix users
        const uUpdates: any = {
            status: 'online',
            driverStatus: 'online',
            isAvailable: true,
            location: mockLocation,
            updatedAt: now
        };
        // Safety clean of pointers
        if (u?.activeRideId) uUpdates.activeRideId = admin.firestore.FieldValue.delete();
        if (u?.currentRideId) uUpdates.currentRideId = admin.firestore.FieldValue.delete();
        if (u?.activeSharedRideId) uUpdates.activeSharedRideId = admin.firestore.FieldValue.delete();
        if (u?.activeSharedGroupId) uUpdates.activeSharedGroupId = admin.firestore.FieldValue.delete();
        
        batch.update(userRef, uUpdates);

        // Fix drivers_locations
        const lUpdates = {
            lat: mockLocation.lat,
            lng: mockLocation.lng,
            online: true,
            isAvailable: true,
            driverStatus: 'online',
            cityKey: 'rawson',
            updatedAt: now
        };
        batch.set(locRef, lUpdates, { merge: true });

        await batch.commit();

        console.log("[SUCCESS] Eduardo ha sido restaurado con ubicación forzada en Rawson y estado online perfecto.");
    }
}

runFix().then(() => process.exit(0));
