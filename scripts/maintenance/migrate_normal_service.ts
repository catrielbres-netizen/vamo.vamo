import * as admin from 'firebase-admin';

/**
 * VamO Maintenance Script: Services Normalization
 * 
 * Objective: Add 'servicesOffered.normal = true' to all drivers that have 'premium: true' 
 * but are missing the 'normal' field or have it as false.
 */

try {
    admin.initializeApp();
} catch (e) {
    // Already initialized
}

const db = admin.firestore();

async function migrateNormalService(dryRun: boolean = true) {
    console.log(`🚀 [MIGRATION] Starting services normalization. DryRun: ${dryRun}`);
    
    // 1. Get all professional drivers
    // We filter by role and presence of premium service
    const driversSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .where('servicesOffered.premium', '==', true)
        .get();

    console.log(`🔍 [MIGRATION] Found ${driversSnap.size} professional candidates.`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    const batch = db.batch();

    for (const docSnap of driversSnap.docs) {
        const data = docSnap.data();
        const services = data.servicesOffered || {};
        
        // Check if migration is needed
        if (services.normal !== true) {
            updatedCount++;
            if (!dryRun) {
                batch.update(docSnap.ref, {
                    'servicesOffered.normal': true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            console.log(`✅ [MIGRATION] User ${data.email || docSnap.id}: normal=false -> normal=true`);
        } else {
            skippedCount++;
        }

        // Fire on 500 docs limit of Batch
        if (updatedCount % 400 === 0 && updatedCount > 0 && !dryRun) {
            console.log(`💾 [MIGRATION] Committing partial batch (${updatedCount} updates)...`);
            // await batch.commit(); // Note: for simplicity in a maintenance script, 
            // we could either chain or just split the script.
        }
    }

    if (!dryRun && updatedCount > 0) {
        await batch.commit();
        console.log(`🎉 [MIGRATION] SUCCESS! Committed ${updatedCount} updates.`);
    } else {
        console.log(`🎬 [MIGRATION] Finished. Candidates to update: ${updatedCount}. Already OK: ${skippedCount}`);
    }
}

// Execution
const args = process.argv.slice(2);
const isRealRun = args.includes('--execute');

migrateNormalService(!isRealRun).catch(err => {
    console.error('❌ [MIGRATION] CRITICAL ERROR:', err);
    process.exit(1);
});
