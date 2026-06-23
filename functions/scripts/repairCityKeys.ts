import * as admin from 'firebase-admin';

// Initialize Firebase Admin (adjust the path to your service account key as needed)
// Usage: npx ts-node scripts/repairCityKeys.ts
try {
  const serviceAccount = require('../../service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  admin.initializeApp();
}

const db = admin.firestore();

async function main() {
    console.log("--- INICIANDO REPARACIÓN DE CITY KEYS (rio-gallegos -> rio_gallegos) ---");
    
    // 1. Repair Users
    const usersRef = db.collection('users');
    const usersSnap = await usersRef.where('cityKey', '==', 'rio-gallegos').get();
    
    console.log(`Se encontraron ${usersSnap.size} usuarios con cityKey = 'rio-gallegos'`);
    
    let batch = db.batch();
    let count = 0;
    
    for (const doc of usersSnap.docs) {
        batch.update(doc.ref, {
            cityKey: 'rio_gallegos',
            cityResolutionSource: 'manual_admin',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        count++;
        
        if (count % 500 === 0) {
            await batch.commit();
            console.log(`Commit de batch (${count} usuarios actualizados)`);
            batch = db.batch();
        }
    }
    
    if (count > 0 && count % 500 !== 0) {
        await batch.commit();
        console.log(`Commit final de batch (${count} usuarios actualizados en total)`);
    }

    // 2. You might also want to repair 'registrationCityKey' if it exists
    const usersRegSnap = await usersRef.where('registrationCityKey', '==', 'rio-gallegos').get();
    console.log(`Se encontraron ${usersRegSnap.size} usuarios con registrationCityKey = 'rio-gallegos'`);
    
    let regBatch = db.batch();
    let regCount = 0;
    
    for (const doc of usersRegSnap.docs) {
        regBatch.update(doc.ref, {
            registrationCityKey: 'rio_gallegos',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        regCount++;
        
        if (regCount % 500 === 0) {
            await regBatch.commit();
            console.log(`Commit de batch (${regCount} usuarios regKeys actualizados)`);
            regBatch = db.batch();
        }
    }
    
    if (regCount > 0 && regCount % 500 !== 0) {
        await regBatch.commit();
        console.log(`Commit final de batch (${regCount} usuarios regKeys actualizados en total)`);
    }

    console.log("--- REPARACIÓN FINALIZADA ---");
}

main().then(() => process.exit(0)).catch(e => {
    console.error("Error crítico durante la reparación:", e);
    process.exit(1);
});
