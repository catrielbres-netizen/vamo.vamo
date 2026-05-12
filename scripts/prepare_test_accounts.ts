import admin from 'firebase-admin';
import * as fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function prepare() {
    console.log('--- PRE-CHECK ACCOUNTS ---');
    
    // 1. Get 3 Passengers and 3 Drivers to be safe
    const passengers = await db.collection('users')
        .where('role', '==', 'passenger')
        .where('profileCompleted', '==', true)
        .limit(3).get();
        
    const drivers = await db.collection('users')
        .where('role', '==', 'driver')
        .where('approved', '==', true)
        .where('profileCompleted', '==', true)
        .limit(3).get();

    if (passengers.empty || drivers.empty) {
        console.log('Error: Not enough test users found.');
        return;
    }

    const accounts = [...passengers.docs, ...drivers.docs];
    
    for (const doc of accounts) {
        const p = doc.data();
        const uid = doc.id;
        
        console.log(`\nChecking ${p.role}: ${uid} (${p.name})`);
        
        // Ensure wallet exists
        const walletRef = db.doc(`wallets/${uid}`);
        const walletSnap = await walletRef.get();
        
        if (!walletSnap.exists) {
            console.log('Creating wallet...');
            await walletRef.set({
                userId: uid,
                cashBalance: 20000,
                promoBalance: 0,
                legacyMigrated: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.doc(`users/${uid}`).update({ currentBalance: 20000, legacyMigrated: true });
        } else {
            const w = walletSnap.data();
            console.log(`Wallet: cash=${w?.cashBalance}, migrated=${w?.legacyMigrated}`);
            
            if ((w?.cashBalance || 0) < 5000 && p.role === 'passenger') {
                console.log('Charging passenger wallet...');
                await walletRef.update({ cashBalance: 20000, legacyMigrated: true });
                await db.doc(`users/${uid}`).update({ currentBalance: 20000, legacyMigrated: true });
            }
        }

        if (p.role === 'driver') {
            console.log('Setting driver online...');
            await db.doc(`users/${uid}`).update({ 
                driverStatus: 'online', 
                approved: true,
                isSuspended: false,
                currentBalance: admin.firestore.FieldValue.increment(0) // Ensure field exists
            });
            // Update drivers_locations
            await db.doc(`drivers_locations/${uid}`).set({
                driverStatus: 'online',
                approved: true,
                isSuspended: false,
                currentLocation: new admin.firestore.GeoPoint(-43.31, -65.04), // Rawson center
                geohash: '69y0', // Approximate for Rawson
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        
        // Final eligibility sync
        await db.doc(`users/${uid}`).update({ 
            cityKey: 'rawson', 
            city: 'Rawson',
            termsVersion: 'v1.3',
            termsAccepted: true,
            profileCompleted: true
        });
    }
    
    console.log('\n--- PRE-CHECK COMPLETE ---');
    console.log('Passengers:', passengers.docs.map(d => d.id));
    console.log('Drivers:', drivers.docs.map(d => d.id));
}

prepare().catch(console.error);
