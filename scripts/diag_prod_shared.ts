import admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();

async function checkProdData() {
    console.log("🔍 Checking Production Feature Flags & Indexes...");
    
    // Check sharedRide feature
    const srDoc = await db.doc('features/sharedRide').get();
    if (srDoc.exists) {
        console.log("✅ features/sharedRide EXISTS:", srDoc.data());
    } else {
        console.log("❌ features/sharedRide MISSING.");
    }
    
    // Check some active shared ride groups to see if we have FAILED_PRECONDITION indexing errors
    try {
        const groups = await db.collection('shared_ride_groups')
            .where('cityKey', '==', 'MENDIOLAZA')
            .where('status', '==', 'collecting_passengers')
            .limit(1)
            .get();
        console.log(`Groups fetch success: ${groups.size} found.`);
    } catch (e: any) {
        console.log(`❌ Error fetching groups (Index missing?):`, e.message);
    }
}

checkProdData().then(() => process.exit(0)).catch(console.error);
