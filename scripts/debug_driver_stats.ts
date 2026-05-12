
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function debugStats() {
    console.log("🔍 Debugging Driver Stats...");
    
    // Get all drivers with dailyStats
    const snap = await db.collection('users').where('role', '==', 'driver').get();
    
    console.log(`Found ${snap.size} drivers.`);
    
    snap.forEach(doc => {
        const data = doc.data();
        if (data.dailyStats) {
            console.log(`Driver: ${doc.id} (${data.name})`);
            console.log(`  - lastResetDate: "${data.dailyStats.lastResetDate}"`);
            console.log(`  - ridesCount: ${data.dailyStats.ridesCount}`);
            console.log(`  - todayStr (Server): "${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })}"`);
        } else {
            console.log(`Driver: ${doc.id} (${data.name}) - NO dailyStats`);
        }
    });
}

debugStats().catch(console.error);
