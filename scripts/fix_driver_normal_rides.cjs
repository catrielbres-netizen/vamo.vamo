/**
 * FIX: Conductor sin viajes normales
 * 
 * Problemas detectados:
 * 1. Conductor real (1BIk2VyuwEZLmHRVbXE52rhFYen2) no tiene documento en drivers/
 * 2. Tiene activeRideId apuntando a un viaje compartido que puede ser fantasma
 * 3. Conductores de simulaciones pasadas siguen online (contaminan el matchmaking)
 */
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const REAL_DRIVER_ID = '1BIk2VyuwEZLmHRVbXE52rhFYen2';
const GHOST_SHARED_RIDE_ID = 'shared_bEHYeU3uDfCfsgwgPRFd';

async function fix() {
    console.log('=== FIX: CONDUCTOR SIN VIAJES NORMALES ===\n');

    // ─── PASO 1: Verificar el viaje compartido fantasma ───────────────────────
    console.log('--- PASO 1: Verificando activeRideId del conductor real ---');
    const sharedRideSnap = await db.doc(`shared_ride_groups/${GHOST_SHARED_RIDE_ID}`).get();
    let sharedRideStatus = null;

    if (!sharedRideSnap.exists) {
        console.log(`⚠️  Viaje compartido ${GHOST_SHARED_RIDE_ID} NO EXISTE en shared_ride_groups`);
        // Verificar en rides/
        const rideSnap = await db.doc(`rides/${GHOST_SHARED_RIDE_ID}`).get();
        if (!rideSnap.exists) {
            console.log(`⚠️  Tampoco existe en rides/ → es un ID fantasma`);
            sharedRideStatus = 'ghost';
        } else {
            sharedRideStatus = rideSnap.data().status;
            console.log(`   Encontrado en rides/ con status: ${sharedRideStatus}`);
        }
    } else {
        sharedRideStatus = sharedRideSnap.data().status;
        console.log(`   Viaje compartido existe con status: ${sharedRideStatus}`);
    }

    // ─── PASO 2: Limpiar activeRideId si el viaje está terminado/es fantasma ──
    const terminalStatuses = ['completed', 'cancelled', 'ghost'];
    if (terminalStatuses.includes(sharedRideStatus)) {
        console.log(`\n✅ Limpiando activeRideId fantasma del conductor ${REAL_DRIVER_ID}...`);
        
        await db.doc(`users/${REAL_DRIVER_ID}`).update({
            activeRideId: FieldValue.delete(),
            activeSharedRideGroupId: FieldValue.delete(),
            sharedRideStatus: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
        });
        console.log('   ✅ activeRideId limpiado en users/');
        
        // Limpiar también en drivers_locations
        await db.doc(`drivers_locations/${REAL_DRIVER_ID}`).update({
            activeRideId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
        }).catch(() => console.log('   (drivers_locations no tenía activeRideId, ok)'));
        console.log('   ✅ drivers_locations actualizado');
    } else {
        console.log(`   ℹ️  Viaje compartido aún activo (${sharedRideStatus}), no se limpia.`);
    }

    // ─── PASO 3: Crear documento en drivers/ para el conductor real ────────────
    console.log(`\n--- PASO 3: Creando/reparando documento en drivers/${REAL_DRIVER_ID} ---`);
    
    const userSnap = await db.doc(`users/${REAL_DRIVER_ID}`).get();
    if (!userSnap.exists) {
        console.log('❌ Usuario no encontrado, abortando.');
        process.exit(1);
    }
    const userData = userSnap.data();

    const driverDoc = {
        uid: REAL_DRIVER_ID,
        approved: userData.approved ?? false,
        isSuspended: userData.isSuspended ?? false,
        municipalStatus: userData.municipalStatus ?? 'pending_municipal_review',
        profileCompleted: userData.profileCompleted ?? false,
        cityKey: userData.cityKey ?? userData.operatingAreaId ?? 'rawson',
        name: userData.name ?? '',
        surname: userData.surname ?? '',
        phone: userData.phone ?? '',
        vehicle: userData.vehicle ?? null,
        driverSubtype: userData.driverSubtype ?? 'standard',
        createdAt: userData.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        _repairedAt: FieldValue.serverTimestamp(),
        _repairedBy: 'fix_driver_normal_rides_script'
    };

    await db.doc(`drivers/${REAL_DRIVER_ID}`).set(driverDoc, { merge: true });
    console.log('   ✅ Documento drivers/ creado/reparado exitosamente');
    console.log('   Datos sincronizados:');
    console.log(`     approved: ${driverDoc.approved}`);
    console.log(`     isSuspended: ${driverDoc.isSuspended}`);
    console.log(`     municipalStatus: ${driverDoc.municipalStatus}`);
    console.log(`     cityKey: ${driverDoc.cityKey}`);

    // ─── PASO 4: Limpiar conductores fantasma de simulaciones ─────────────────
    console.log('\n--- PASO 4: Limpiando conductores fantasma de simulaciones ---');
    
    const locSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .get();

    const batch = db.batch();
    let ghostCount = 0;
    let simCount = 0;

    for (const doc of locSnap.docs) {
        const dId = doc.id;
        const data = doc.data();

        // Conductores de simulaciones (prefijo conocido)
        const isSimDriver = 
            dId.startsWith('driver_chaos_v2_') || 
            dId.startsWith('driver_peakhour_') ||
            dId.startsWith('driver_stress_') ||
            dId.startsWith('sim_driver_') ||
            (data.isTestDriver === true);

        if (isSimDriver) {
            simCount++;
            batch.update(doc.ref, {
                driverStatus: 'offline',
                isAvailable: false,
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`   🧹 Poniendo offline sim-driver: ${dId}`);
            continue;
        }

        // Conductores sin geohash ni ubicación (corruptos/fantasma)
        const lat = data.currentLocation?.lat ?? data.currentLocation?.latitude;
        const lng = data.currentLocation?.lng ?? data.currentLocation?.longitude;
        const hasLocation = lat !== undefined && lng !== undefined;
        const hasGeohash = !!data.geohash;

        if (!hasLocation || !hasGeohash) {
            // Verificar si el usuario real existe
            const userDoc = await db.doc(`users/${dId}`).get();
            if (!userDoc.exists) {
                ghostCount++;
                batch.update(doc.ref, {
                    driverStatus: 'offline',
                    isAvailable: false,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   🧹 Poniendo offline ghost (sin usuario): ${dId}`);
            } else {
                const u = userDoc.data();
                // Si el usuario existe pero no tiene ubicación válida, ponerlo offline igual
                if (!hasLocation) {
                    ghostCount++;
                    batch.update(doc.ref, {
                        driverStatus: 'offline',
                        isAvailable: false,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`   🧹 Poniendo offline conductor sin ubicación: ${dId} (${u.name || 'sin nombre'})`);
                }
            }
        }
    }

    if (ghostCount > 0 || simCount > 0) {
        await batch.commit();
        console.log(`\n   ✅ Limpieza completada:`);
        console.log(`      - Conductores de simulación puestos offline: ${simCount}`);
        console.log(`      - Conductores fantasma puestos offline: ${ghostCount}`);
    } else {
        console.log('   ✅ No había conductores fantasma para limpiar.');
    }

    // ─── PASO 5: Verificación final ───────────────────────────────────────────
    console.log('\n--- PASO 5: Verificación final del conductor real ---');
    
    const finalUserSnap = await db.doc(`users/${REAL_DRIVER_ID}`).get();
    const finalLocSnap = await db.doc(`drivers_locations/${REAL_DRIVER_ID}`).get();
    const finalDriverSnap = await db.doc(`drivers/${REAL_DRIVER_ID}`).get();
    
    const u = finalUserSnap.data();
    const l = finalLocSnap.data();
    const d = finalDriverSnap.data();

    console.log('\n  📋 Estado final del conductor:');
    console.log(`     users/     → approved: ${u?.approved}, activeRideId: ${u?.activeRideId || 'LIMPIO ✅'}, driverStatus: ${u?.driverStatus}`);
    console.log(`     drivers/   → approved: ${d?.approved}, isSuspended: ${d?.isSuspended} ${finalDriverSnap.exists ? '✅' : '❌ AUN NO EXISTE'}`);
    
    const lat = l?.currentLocation?.lat;
    const lng = l?.currentLocation?.lng;
    console.log(`     locations/ → status: ${l?.driverStatus}, geohash: ${l?.geohash || '❌ FALTANTE'}, lat: ${lat}, lng: ${lng}`);

    const isMatchable = u?.approved && !u?.isSuspended && !u?.activeRideId && 
                        u?.driverStatus === 'online' && finalDriverSnap.exists &&
                        d?.approved && l?.geohash;

    console.log(`\n  ${isMatchable ? '🟢 CONDUCTOR DEBERÍA RECIBIR VIAJES AHORA' : '🔴 AÚN HAY PROBLEMAS'}`);
    
    if (!isMatchable) {
        if (!u?.approved) console.log('     ❌ No aprobado en users/');
        if (u?.activeRideId) console.log(`     ❌ Aún tiene activeRideId: ${u.activeRideId}`);
        if (u?.driverStatus !== 'online') console.log(`     ❌ driverStatus: ${u?.driverStatus} (necesita estar online)`);
        if (!finalDriverSnap.exists) console.log('     ❌ Documento en drivers/ no existe');
        if (!d?.approved) console.log('     ❌ No aprobado en drivers/');
        if (!l?.geohash) console.log('     ❌ Sin geohash en drivers_locations');
    }

    console.log('\n=== FIX COMPLETADO ===');
    process.exit(0);
}

fix().catch(e => {
    console.error('ERROR FATAL:', e.message);
    process.exit(1);
});
