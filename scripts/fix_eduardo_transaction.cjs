const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function run() {
    const ptRef = db.collection('platform_transactions').doc();
    const eduardoId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    
    console.log("Writing missing transaction for Eduardo...");
    await ptRef.set({
        driverId: eduardoId,
        userId: eduardoId,
        amount: 3409,
        type: 'weekly_pool_bonus',
        description: `Premio Pozo Semanal VamO - Puesto #1 (Corregido)`,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log("Writing notification for Eduardo...");
    const notifRef = db.collection('notifications').doc(eduardoId).collection('items').doc();
    await notifRef.set({
        userId: eduardoId,
        role: 'driver',
        type: 'payment_received',
        title: '¡Recibiste el Premio del Pozo Semanal!',
        message: `Felicitaciones por quedar en el Puesto #1. Se te acreditaron $3409 a tu billetera.`,
        read: false,
        priority: 'success',
        actionUrl: '/driver/earnings',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log("Done.");
}

run().then(() => process.exit(0)).catch(console.error);
