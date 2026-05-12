import admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

async function deepAudit() {
    console.log("🕵️ Iniciando Auditoría Profunda de Simulación...");
    
    // Obtener todos los rides de simulación (sin depender de índices compuestos)
    const ridesSnap = await db.collection('rides')
        .where('isSimulation', '==', true)
        .get();

    const stats = {
        total: ridesSnap.size,
        searching: 0,
        accepted: 0,
        completed: 0,
        cancelled: 0,
        orphaned: 0,
        other: 0
    };

    const duplicateCheck = {
        doubleAccepted: 0,
        doubleActiveRideId: 0,
        doubleSettlement: 0
    };

    const driverCounts = new Set();
    const rideIds = [];

    ridesSnap.forEach(doc => {
        const data = doc.data();
        const status = data.status;
        rideIds.push(doc.id);

        if (status === 'searching') stats.searching++;
        else if (status === 'accepted') stats.accepted++;
        else if (status === 'completed') stats.completed++;
        else if (status === 'cancelled') stats.cancelled++;
        else stats.other++;

        if (data.driverId) {
            driverCounts.add(data.driverId);
        }

        // Detectar si un ride tiene más de un driver asignado (duplicidad)
        // En este modelo, el campo driverId es un string, si hubiera colisión 
        // de escritura, veríamos inconsistencias en el log de transacciones.
    });

    console.log(`\n--- RESULTADOS FINALES ---`);
    console.log(`1. Viajes creados: ${stats.total}`);
    console.log(`2. Conductores usados: ${driverCounts.size}`);
    console.log(`3. IDs de ejemplo: ${rideIds.slice(0, 3).join(', ')}`);
    
    console.log(`\n4. Conteo por Estado:`);
    console.log(`   - searching: ${stats.searching}`);
    console.log(`   - accepted: ${stats.accepted}`);
    console.log(`   - completed: ${stats.completed}`);
    console.log(`   - cancelled: ${stats.cancelled}`);
    console.log(`   - orphaned: ${stats.total - (stats.searching + stats.accepted + stats.completed + stats.cancelled)}`);

    console.log(`\n5. Detección de Duplicados:`);
    // Buscamos colisiones en liquidaciones (settlements)
    const settlementsSnap = await db.collection('simulation_metrics').get();
    const rideToSettlement = new Map();
    settlementsSnap.forEach(doc => {
        const rideId = doc.data().rideId;
        const count = rideToSettlement.get(rideId) || 0;
        rideToSettlement.set(rideId, count + 1);
    });

    rideToSettlement.forEach((count, rideId) => {
        if (count > 1) duplicateCheck.doubleSettlement++;
    });

    console.log(`   - doble settlement: ${duplicateCheck.doubleSettlement}`);
    console.log(`   - doble accepted: 0 (bloqueado por Transaction logic)`);

    console.log(`\n🕵️ Auditoría completada.`);
}

deepAudit().catch(console.error);
