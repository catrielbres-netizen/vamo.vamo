import admin from 'firebase-admin';
import * as fs from 'fs';

const sa = JSON.parse(fs.readFileSync('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const auth = admin.auth();

const EMAILS = [
    'gp1877774@gmail.com',
    'autorcompositoreducisneros@gmail.com',
    'cesareduardobres@gmail.com',
    'catrielcesarleandrobres@gmail.com',
    'bresgianella@gmail.com'
];

async function dryRun() {
    console.log('🔍 INICIANDO DRY RUN DE LIMPIEZA PROFUNDA');
    console.log('-----------------------------------------');

    const uids: string[] = [];
    const emailToUid: Record<string, string> = {};

    // 1. Resolver UIDs
    for (const email of EMAILS) {
        try {
            const user = await auth.getUserByEmail(email);
            uids.push(user.uid);
            emailToUid[email] = user.uid;
            console.log(`✅ [AUTH] ${email} -> ${user.uid}`);
        } catch (e) {
            console.warn(`⚠️ [AUTH] No se encontró el usuario para: ${email}`);
        }
    }

    if (uids.length === 0) {
        console.error('❌ No se encontraron UIDs para los emails provistos.');
        return;
    }

    const report: any = {
        users: 0,
        wallets: 0,
        public_driver_profiles: 0,
        drivers_locations: 0,
        driver_points: 0,
        rides: 0,
        rideOffers: 0,
        wallet_transactions: 0,
        wallet_movements: 0,
        platform_transactions: 0,
        withdrawal_requests: 0,
        fap_claims: 0,
        safety_recordings: 0,
        referrals: 0,
        rideIds: [] as string[]
    };

    // 2. Contar documentos por colección
    for (const uid of uids) {
        // Directos por ID
        if ((await db.doc(`users/${uid}`).get()).exists) report.users++;
        if ((await db.doc(`wallets/${uid}`).get()).exists) report.wallets++;
        if ((await db.doc(`public_driver_profiles/${uid}`).get()).exists) report.public_driver_profiles++;
        if ((await db.doc(`drivers_locations/${uid}`).get()).exists) report.drivers_locations++;
        if ((await db.doc(`driver_points/${uid}`).get()).exists) report.driver_points++;

        // Relacionados por query
        const ridesPassenger = await db.collection('rides').where('passengerId', '==', uid).get();
        const ridesDriver = await db.collection('rides').where('driverId', '==', uid).get();
        report.rides += ridesPassenger.size + ridesDriver.size;
        ridesPassenger.forEach(d => report.rideIds.push(d.id));
        ridesDriver.forEach(d => report.rideIds.push(d.id));

        const offersPassenger = await db.collection('rideOffers').where('passengerId', '==', uid).get();
        const offersDriver = await db.collection('rideOffers').where('driverId', '==', uid).get();
        report.rideOffers += offersPassenger.size + offersDriver.size;

        const walletTx = await db.collection('wallet_transactions').where('userId', '==', uid).get();
        report.wallet_transactions += walletTx.size;

        const walletMov = await db.collection('wallet_movements').where('userId', '==', uid).get();
        report.wallet_movements += walletMov.size;

        // Platform transactions (complex query)
        const ptUserId = await db.collection('platform_transactions').where('userId', '==', uid).get();
        const ptDriverId = await db.collection('platform_transactions').where('driverId', '==', uid).get();
        const ptPassengerId = await db.collection('platform_transactions').where('passengerId', '==', uid).get();
        report.platform_transactions += ptUserId.size + ptDriverId.size + ptPassengerId.size;

        const withdrawals = await db.collection('withdrawal_requests').where('userId', '==', uid).get();
        report.withdrawal_requests += withdrawals.size;

        const fap = await db.collection('fap_claims').where('userId', '==', uid).get();
        report.fap_claims += fap.size;

        const recordings = await db.collection('safety_recordings').where('userId', '==', uid).get();
        report.safety_recordings += recordings.size;

        const refs = await db.collection('referrals').where('userId', '==', uid).get();
        report.referrals += refs.size;
    }

    // Clean duplicates in rideIds
    report.rideIds = Array.from(new Set(report.rideIds));

    console.log('\n--- REPORTE FINAL (DRY RUN) ---');
    console.log('Emails -> UIDs:', JSON.stringify(emailToUid, null, 2));
    console.log('\nTOTALES POR COLECCIÓN:');
    console.log(`- users: ${report.users}`);
    console.log(`- wallets: ${report.wallets}`);
    console.log(`- public_driver_profiles: ${report.public_driver_profiles}`);
    console.log(`- drivers_locations: ${report.drivers_locations}`);
    console.log(`- driver_points: ${report.driver_points}`);
    console.log(`- rides: ${report.rides}`);
    console.log(`- rideOffers: ${report.rideOffers}`);
    console.log(`- wallet_transactions: ${report.wallet_transactions}`);
    console.log(`- wallet_movements: ${report.wallet_movements}`);
    console.log(`- platform_transactions: ${report.platform_transactions}`);
    console.log(`- withdrawal_requests: ${report.withdrawal_requests}`);
    console.log(`- fap_claims: ${report.fap_claims}`);
    console.log(`- safety_recordings: ${report.safety_recordings}`);
    console.log(`- referrals: ${report.referrals}`);
    console.log('\nLISTA DE RIDE IDs (primeros 20):');
    console.log(report.rideIds.slice(0, 20).join(', '));
    if (report.rideIds.length > 20) console.log(`... y ${report.rideIds.length - 20} más.`);
    
    console.log('\n-----------------------------------------');
    console.log('⚠️ NO SE HA BORRADO NADA. ESPERANDO CONFIRMACIÓN.');
}

dryRun().catch(console.error);
