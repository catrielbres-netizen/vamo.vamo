import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// 1. Project Detection (Copied from working simulation script)
let projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    try {
        const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
        if (fs.existsSync(firebasercPath)) {
            const rc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
            projectId = rc.projects?.default;
        }
    } catch (e) {}
}

if (!projectId) {
    console.error("❌ No se pudo detectar projectId.");
    process.exit(1);
}

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

async function initAntifraudConfig() {
    const configRef = db.collection('system_config').doc('antifraud');
    
    const config = {
        enabled: true,
        mode: "monitor", // DO NOT SET TO ENFORCE YET
        blockSuspiciousRides: false,
        blockSuspiciousClaims: false,
        blockSuspiciousUsers: false,
        requireManualReviewAboveScore: 70,
        autoBlockAboveScore: 90,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "initial_setup_script"
    };

    console.log(`Setting up Antifraud Config in MONITOR mode for project: ${projectId}...`);
    await configRef.set(config, { merge: true });
    console.log("Antifraud Config initialized.");
}

initAntifraudConfig().catch(console.error);
