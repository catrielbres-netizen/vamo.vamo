import admin from 'firebase-admin';
import * as fs from 'fs';

const sa = JSON.parse(fs.readFileSync('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();

const UIDS = [
    'Rth4cDNpDGZloH2wRvHm59DWZS83',
    '7hqhTZTheJYtF2C3n9GM7hvGajR2',
    'hBBDZRKgBVQGetjHxZvNFst6pBg1',
    'Hz1V3NqiBHZ2rPfFj6kzOWE5wjo1',
    'kYwWjszleCN760KH8j5eqRJljSN2'
];

async function deleteInBatches(collectionName: string, queryField: string, uids: string[]) {
    let totalDeleted = 0;
    for (const uid of uids) {
        let hasMore = true;
        while (hasMore) {
            const snapshot = await db.collection(collectionName).where(queryField, '==', uid).limit(400).get();
            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += snapshot.size;
            console.log(`[BATCH] Borrados ${snapshot.size} docs de ${collectionName} para UID ${uid}`);
        }
    }
    return totalDeleted;
}

async function deletePlatformTransactions(uids: string[]) {
    let totalDeleted = 0;
    const fields = ['userId', 'driverId', 'passengerId'];
    for (const field of fields) {
        const deletedCount = await deleteInBatches('platform_transactions', field, uids);
        totalDeleted += deletedCount;
    }
    return totalDeleted;
}

async function deleteDirectDocs(collectionName: string, uids: string[]) {
    const batch = db.batch();
    let count = 0;
    for (const uid of uids) {
        batch.delete(db.doc(`${collectionName}/${uid}`));
        count++;
    }
    await batch.commit();
    console.log(`[DIRECT] Borrados ${count} docs de ${collectionName}`);
    return count;
}

async function executeCleanup() {
    console.log('🚀 INICIANDO BORRADO CONTROLADO - PRODUCCIÓN');
    console.log('-------------------------------------------');

    const results: Record<string, number> = {};

    try {
        // 1. rideOffers
        console.log('Step 1: rideOffers...');
        results.rideOffers = await deleteInBatches('rideOffers', 'driverId', UIDS);
        results.rideOffers += await deleteInBatches('rideOffers', 'passengerId', UIDS);

        // 2. wallet_transactions
        console.log('Step 2: wallet_transactions...');
        results.wallet_transactions = await deleteInBatches('wallet_transactions', 'userId', UIDS);

        // 3. wallet_movements
        console.log('Step 3: wallet_movements...');
        results.wallet_movements = await deleteInBatches('wallet_movements', 'userId', UIDS);

        // 4. platform_transactions
        console.log('Step 4: platform_transactions...');
        results.platform_transactions = await deletePlatformTransactions(UIDS);

        // 5. rides
        console.log('Step 5: rides...');
        results.rides = await deleteInBatches('rides', 'driverId', UIDS);
        results.rides += await deleteInBatches('rides', 'passengerId', UIDS);

        // 6. driver_points
        console.log('Step 6: driver_points...');
        results.driver_points = await deleteDirectDocs('driver_points', UIDS);

        // 7. drivers_locations
        console.log('Step 7: drivers_locations...');
        results.drivers_locations = await deleteDirectDocs('drivers_locations', UIDS);

        // 8. public_driver_profiles
        console.log('Step 8: public_driver_profiles...');
        results.public_driver_profiles = await deleteDirectDocs('public_driver_profiles', UIDS);

        // 9. wallets
        console.log('Step 9: wallets...');
        results.wallets = await deleteDirectDocs('wallets', UIDS);

        // 10. users
        console.log('Step 10: users...');
        results.users = await deleteDirectDocs('users', UIDS);

        console.log('\n--- REPORTE FINAL DE BORRADO ---');
        Object.entries(results).forEach(([coll, count]) => {
            console.log(`- ${coll}: ${count} borrados`);
        });

        console.log('\n🔍 INICIANDO VERIFICACIÓN FINAL...');
        // Verificación simple
        const verifyRides = await db.collection('rides').where('passengerId', 'in', UIDS.slice(0, 10)).limit(1).get();
        if (verifyRides.empty) console.log('✅ Verificación RIDES: 0 registros.');
        else console.log('❌ Verificación RIDES: FALLIDA.');

        const verifyUsers = await db.doc(`users/${UIDS[0]}`).get();
        if (!verifyUsers.exists) console.log('✅ Verificación USERS: 0 registros.');
        else console.log('❌ Verificación USERS: FALLIDA.');

    } catch (error) {
        console.error('❌ FATAL ERROR DURANTE EL BORRADO:', error);
        process.exit(1);
    }
}

executeCleanup().catch(console.error);
