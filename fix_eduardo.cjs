const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function fix(driverId) {
    const userRef = db.doc(`users/${driverId}`);
    const muniRef = db.doc(`municipal_profiles/${driverId}`);
    
    // Si estaba municipal_observed, arreglarlo a traffic_suspended
    await userRef.update({
        municipalStatus: 'pending_municipal_review', // reset to base
        trafficSuspended: true,
        isSuspended: true,
        suspensionSource: 'traffic',
        trafficSuspensionReason: 'Documentación observada preventivamente'
    });
    
    await muniRef.update({
        municipalStatus: 'pending_municipal_review',
        trafficSuspended: true,
        isSuspended: true,
        suspensionSource: 'traffic'
    });
    
    console.log("Eduardo's state has been explicitly fixed to TRAFFIC OBSERVED!");
    process.exit(0);
}

fix('VNhou0ag4wXXPr6IXa3foO6SI8B3').catch(console.error);
