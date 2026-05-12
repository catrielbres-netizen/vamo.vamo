
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function applyCordobaOrdinance() {
    console.log('🚀 Aplicando configuración de Ordenanza 13.549 para Córdoba (Corrección de Tasas)...');

    const cityKey = 'cordoba';

    // 1. Configuración de Tarifas (Abril 2026 - Taxis Córdoba)
    // Fuente: Valores vigentes desde el 11 de abril de 2026
    const pricingRef = db.collection('municipal_pricing').doc(cityKey);
    const cordobaPricing = {
        version: 3,
        DAY_BASE_FARE: 1900,        // Bajada de Bandera Diurna
        DAY_PRICE_PER_100M: 150,    // Valor de la Ficha (cada 110m)
        DAY_WAITING_PER_MIN: 150,   // 1 Ficha por minuto
        NIGHT_BASE_FARE: 2200,      // Bajada de Bandera Nocturna
        NIGHT_PRICE_PER_100M: 175,  // Valor de la Ficha Nocturna
        NIGHT_WAITING_PER_MIN: 175,
        DISTANCE_FRACTION_METERS: 110, // Fracción Córdoba: 110 metros
        WAITING_FRACTION_SECONDS: 60,
        MINIMUM_FARE: 1900,
        PLATFORM_COMMISSION_RATE: 160, // 16% Total (VamO + Canon) -> 160/1000 = 0.16
        municipalRate: 0.02,           // 2% Canon Municipal (incluido en el 16%)
        assistanceEnabled: true,
        updatedAt: FieldValue.serverTimestamp()
    };

    await pricingRef.set(cordobaPricing, { merge: true });
    console.log('✅ Tarifas de Córdoba (Taxis Abril 2026) actualizadas.');

    // 2. Configuración de la Ciudad
    const cityRef = db.collection('cities').doc(cityKey);
    await cityRef.set({
        cityKey,
        name: 'Córdoba',
        province: 'Córdoba',
        country: 'Argentina',
        status: 'active',
        config: {
            pricingModel: 'municipal_meter_v2',
            fapEnabled: true,
            broadcastEnabled: true,
            municipalCanonEnabled: true,
            requiredDocuments: [
                'dniFront',
                'dniBack',
                'driverLicense',
                'vehicleInsurance',
                'vehicleRegistrationCard',
                'criminalRecord',
                'sexualCriminalRecord',
                'cuitProof',
                'itvCertificate',
                'carRadicacionProof',
                'disinfectionReceipt'
            ]
        },
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('✅ Requisitos de Ordenanza 13.549 aplicados a Córdoba.');

    console.log('✨ Proceso de actualización finalizado.');
}

applyCordobaOrdinance().catch(err => {
    console.error('❌ Error al aplicar configuración:', err);
    process.exit(1);
});
