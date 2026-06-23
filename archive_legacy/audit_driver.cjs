const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function audit(driverId) {
    const userDoc = await db.doc(`users/${driverId}`).get();
    const muniDoc = await db.doc(`municipal_profiles/${driverId}`).get();
    
    console.log("=== USERS ===");
    console.log(JSON.stringify(userDoc.data(), null, 2));
    
    console.log("\n=== MUNICIPAL PROFILES ===");
    console.log(JSON.stringify(muniDoc.data(), null, 2));
    
    process.exit(0);
}

audit('VNhou0ag4wXXPr6IXa3foO6SI8B3').catch(console.error);
