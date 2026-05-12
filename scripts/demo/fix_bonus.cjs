const admin = require('firebase-admin');

const app = admin.initializeApp({
  projectId: "studio-6697160840-7c67f"
});

const db = admin.firestore();

async function addBonusToParticular() {
    const driverId = 'hfW54QZs6BUuGHBUaS84AGVYZfw1'; // The ID the user shared
    const userRef = db.collection('users').doc(driverId);
    const snap = await userRef.get();
    
    if (!snap.exists) {
        console.log("No existe.");
        process.exit(1);
    }
    
    const data = snap.data();
    if (data.promoCreditGranted) {
        console.log("Ya tiene el bono otorgado.");
        process.exit(0);
    }
    
    const promoAmount = 2000;
    
    const batch = db.batch();
    batch.update(userRef, {
        promoCreditGranted: true,
        currentBalance: admin.firestore.FieldValue.increment(promoAmount),
        nonWithdrawableBalance: admin.firestore.FieldValue.increment(promoAmount)
    });
    
    const txRef = db.collection('platform_transactions').doc();
    batch.set(txRef, {
        driverId: driverId,
        amount: promoAmount,
        type: 'credit_promo',
        source: 'system',
        note: 'Bono de bienvenida por aprobación de cuenta.',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    await batch.commit();
    console.log("Bono otorgado exitosamente al driver", driverId);
    process.exit(0);
}

addBonusToParticular().catch(console.error);
