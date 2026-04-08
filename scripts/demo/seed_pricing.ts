import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// Inicializar Firebase (usa GOOGLE_APPLICATION_CREDENTIALS o tu Auth por defecto)
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}
const db = admin.firestore();

async function run() {
    console.log('🌱 Sembrando config/pricing...');
    
    // 1. Guardar campos en la RAÍZ de config/pricing
    await db.doc('config/pricing').set({
      "version": 1,
      "DAY_BASE_FARE": 1483,
      "DAY_PRICE_PER_100M": 152,
      "DAY_WAITING_PER_MIN": 220,
      "NIGHT_BASE_FARE": 1652,
      "NIGHT_PRICE_PER_100M": 189,
      "NIGHT_WAITING_PER_MIN": 277,
      "MINIMUM_FARE": 1500
    }, { merge: true });

    console.log('✅ config/pricing actualizado (raíz).');

    console.log('🌱 Sembrando cities/rawson...');
    
    // 2. Guardar dentro de pricing y habilitar
    await db.doc('cities/rawson').set({
      "enabled": true,
      "pricing": {
        "version": 1,
        "DAY_BASE_FARE": 1483,
        "DAY_PRICE_PER_100M": 152,
        "DAY_WAITING_PER_MIN": 220,
        "NIGHT_BASE_FARE": 1652,
        "NIGHT_PRICE_PER_100M": 189,
        "NIGHT_WAITING_PER_MIN": 277,
        "MINIMUM_FARE": 1500
      }
    }, { merge: true });

    console.log('✅ cities/rawson actualizado (.pricing y enabled).');

    console.log('🚀 Tarifas inyectadas correctamente y sin tocar la estructura existente.');
    process.exit(0);
}

run().catch(e => {
    console.error('❌ Error inyectando tarifas en Firestore:', e);
    process.exit(1);
});
