
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function syncTreasury() {
    console.log("--- SYNCING TREASURY WITH CITY STATS ---");
    const citiesSnap = await db.collection('cities').get();
    
    for (const cityDoc of citiesSnap.docs) {
        const cityKey = cityDoc.id;
        const stats = cityDoc.data().stats || {};
        const totalContribution = stats.totalMunicipalContribution || 0;
        
        if (totalContribution > 0) {
            console.log(`City: ${cityKey} | Total Contribution: ${totalContribution}`);
            
            const muniAccountRef = db.collection('municipal_accounts').doc(cityKey.toLowerCase());
            
            // Atomic update to avoid overwriting if a ride happens during sync
            await db.runTransaction(async (tx) => {
                const accountSnap = await tx.get(muniAccountRef);
                const currentBalance = accountSnap.exists ? (accountSnap.data().currentBalance || 0) : 0;
                
                // If the account is already at 0 or lower than the stats, we sync it
                // We only do this "en fase inicial" to bootstrap the treasury.
                if (currentBalance < totalContribution) {
                    tx.set(muniAccountRef, {
                        cityKey: cityKey.toLowerCase(),
                        currentBalance: totalContribution,
                        totalAccumulated: totalContribution,
                        lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'active'
                    }, { merge: true });
                    console.log(`  -> Synced! New Balance: ${totalContribution}`);
                } else {
                    console.log(`  -> Already synced or has higher balance (${currentBalance}). Skipping.`);
                }
            });
        } else {
            console.log(`City: ${cityKey} | No contribution found. Skipping.`);
        }
    }
    console.log("--- SYNC COMPLETE ---");
}

syncTreasury().catch(console.error);
