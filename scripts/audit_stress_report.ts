import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
});

const db = admin.firestore();

async function runAudit() {
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .get();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const filteredRides = ridesSnap.docs.filter(doc => {
        const data = doc.data();
        return data.updatedAt && data.updatedAt.toMillis() > todayStart.getTime();
    });

    let totalFacturado = 0;
    let totalVamoPay = 0;
    let totalEfectivo = 0;
    let totalDriverEarning = 0;
    let totalVamoComm = 0;
    let totalMuniComm = 0;

    const rideList = [];

    for (const doc of filteredRides) {
        const ride = doc.data();
        const cr = ride.completedRide || {};
        const total = cr.totalFare || 0;
        
        totalFacturado += total;
        if (ride.paymentMethod === 'wallet') totalVamoPay += total;
        else totalEfectivo += total;

        totalDriverEarning += cr.driverNetAmount || 0;
        totalVamoComm += cr.commissionAmount || 0;
        totalMuniComm += cr.municipalFee || 0;

        rideList.push({
            id: doc.id,
            method: ride.paymentMethod,
            amount: total,
            passengerCharged: total,
            driverEarned: cr.driverNetAmount || 0,
            settled: !!ride.settledAt,
            settlementError: ride.settlementError || null
        });
    }

    const passengerId = '7hqhTZTheJYtF2C3n9GM7hvGajR2';
    const driverId = 'hBBDZRKgBVQGetjHxZvNFst6pBg1';

    const pUser = (await db.doc(`users/${passengerId}`).get()).data();
    const pWallet = (await db.doc(`wallets/${passengerId}`).get()).data();
    const dUser = (await db.doc(`users/${driverId}`).get()).data();
    const dWallet = (await db.doc(`wallets/${driverId}`).get()).data();

    const locks = await db.collection('wallet_transactions')
        .where('walletId', '==', passengerId)
        .where('type', '==', 'lock')
        .get();

    const consumes = await db.collection('wallet_transactions')
        .where('walletId', '==', passengerId)
        .where('type', '==', 'consume')
        .get();

    console.log('--- STATS ---');
    console.log('Total Rides:', rideList.length);
    console.log('Facturado:', totalFacturado);
    console.log('VamoPay:', totalVamoPay);
    console.log('Efectivo:', totalEfectivo);
    console.log('DriverEarning:', totalDriverEarning);
    console.log('VamoComm:', totalVamoComm);
    console.log('MuniComm:', totalMuniComm);
    console.log('Sync P:', pUser.currentBalance === pWallet.cashBalance ? 'YES' : 'NO');
    console.log('Sync D:', dUser.currentBalance === dWallet.cashBalance ? 'YES' : 'NO');
    console.log('P Balance:', pUser.currentBalance);
    console.log('D Balance:', dUser.currentBalance);
    console.log('P Locked:', pWallet.lockedCash);
    console.log('Locks:', locks.size);
    console.log('Consumes:', consumes.size);
    console.log('--- RIDES ---');
    console.log(JSON.stringify(rideList));
}

runAudit();
