import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function run() {
    console.log("=== VERIFYING CITIES ===");
    const citiesSnap = await db.collection('cities').get();
    citiesSnap.forEach(doc => {
        const data = doc.data();
        console.log(`${doc.id}: status=${data.status}, name=${data.name}`);
    });
    
    console.log("\n=== VERIFYING RECENT DRIVERS (Last 3) ===");
    const usersSnap = await db.collection('users').where('role', '==', 'driver').orderBy('createdAt', 'desc').limit(3).get();
    usersSnap.forEach(doc => {
        const data = doc.data();
        console.log(`Driver ${doc.id}: email=${data.email}, cityKey=${data.cityKey}, muniStatus=${data.municipalStatus}, docsStatus=${data.docsStatus}`);
        console.log(`  - fields present: registrationCityKey? ${!!data.registrationCityKey}, sourceLinkCityKey? ${!!data.sourceLinkCityKey}`);
        if (data.documents) {
            console.log(`  - documents:`, Object.keys(data.documents));
        }
    });

    console.log("\n=== DONE ===");
}

run().catch(console.error);
