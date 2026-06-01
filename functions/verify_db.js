
const admin = require('firebase-admin');

async function verify() {
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
        const db = admin.firestore();
        
        console.log('--- VERIFYING PHONE_INDEX ---');
        const phoneSnap = await db.collection('phone_index').limit(5).get();
        console.log(`Found ${phoneSnap.size} entries in phone_index.`);
        phoneSnap.forEach(doc => {
            console.log(`Phone: ${doc.id} -> UID: ${doc.data().uid}`);
        });

        console.log('\n--- VERIFYING WALLET LOCKS ---');
        const walletSnap = await db.collection('wallets').where('lockedRideId', '!=', null).limit(5).get();
        console.log(`Found ${walletSnap.size} active wallet locks.`);
        walletSnap.forEach(doc => {
            console.log(`Wallet ${doc.id}: Ride ${doc.data().lockedRideId}, Cash: ${doc.data().lockedCash}`);
        });

        console.log('\n--- VERIFYING RIDES ---');
        const ridesSnap = await db.collection('rides').orderBy('updatedAt', 'desc').limit(5).get();
        ridesSnap.forEach(doc => {
            const data = doc.data();
            console.log(`Ride ${doc.id}: Status=${data.status}, Financial=${data.financialStatus || 'OK'}`);
        });

    } catch (err) {
        console.error('Error verifying DB:', err);
    }
}

verify();
