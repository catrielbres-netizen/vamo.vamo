const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function auditOffers() {
    console.log("--- INICIANDO AUDITORÍA DE RIDE OFFERS ---");
    const offersSnap = await db.collection('rideOffers').orderBy('sentAt', 'desc').limit(20).get();
    
    if (offersSnap.empty) {
        console.log("No se encontraron ofertas recientes.");
        return;
    }

    offersSnap.forEach(doc => {
        const data = doc.data();
        const sentAt = data.sentAt ? data.sentAt.toDate().toISOString() : 'N/A';
        console.log(`[OFFER ${doc.id}]`);
        console.log(`  Ride: ${data.rideId}`);
        console.log(`  Driver: ${data.driverId}`);
        console.log(`  Amount: $${data.estimatedTotal}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  SentAt: ${sentAt}`);
        console.log(`  City: ${data.cityKey}`);
        
        if (data.estimatedTotal === 0 || !data.estimatedTotal) {
            console.warn("  ⚠️ ALERTA: Oferta con importe $0 detectada.");
        }
        if (!data.origin || !data.destination) {
            console.warn("  ⚠️ ALERTA: Datos de ubicación incompletos.");
        }
        console.log("-----------------------------------");
    });
}

auditOffers().catch(console.error);
