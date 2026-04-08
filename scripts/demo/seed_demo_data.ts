/**
 * seed_demo_data.ts
 *
 * Siembra en Firestore todos los datos necesarios para que la demo splits-screen
 * se vea completa, real y profesional.
 *
 * USO:
 *   npx tsx scripts/demo/seed_demo_data.ts
 *
 * REQUIERE:
 *   - Variables de entorno en .env (NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 *   - Application Default Credentials o GOOGLE_APPLICATION_CREDENTIALS
 */

import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Inicializar Firebase Admin ───────────────────────────────────────────────
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();
const sv = admin.firestore.FieldValue.serverTimestamp;

// ─── UIDs de usuarios demo ────────────────────────────────────────────────────
const DEMO_PASSENGER_UID = process.env.DEMO_PASSENGER_UID || 'XadNzvLKNIfpCyjXBbZS7mvNeSC2';
const DEMO_DRIVER_UID    = process.env.DEMO_DRIVER_UID    || 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23';

// ─── Datos del pasajero ───────────────────────────────────────────────────────
const passengerData: Record<string, any> = {
    uid:              DEMO_PASSENGER_UID,
    email:            'demo_passenger@vamo.com',
    name:             'Pasajero Demo',
    role:             'passenger',
    profileCompleted: true,
    approved:         true,
    emailVerified:    true,
    phone:            '+542804000000',
    activeRideId:     null,
    city:             'Rawson',

    // Nivel de pasajero: nivel 2 "Express" con 8 viajes del mes
    passengerProgress: { level: 2, monthlyRides: 8 },

    // Bono de bienvenida disponible — se ve en la pantalla de pedir viaje
    welcomeBonus: { available: true, used: false },

    // Código de referido del pasajero
    referralCode: 'VAMOFRIEND',

    // Para la demo el pasajero no tiene viaje activo
    updatedAt: sv(),
};

// ─── Datos del conductor ──────────────────────────────────────────────────────
const driverData: Record<string, any> = {
    uid:              DEMO_DRIVER_UID,
    email:            'demo_driver@vamo.com',
    name:             'Chofer Demo',
    role:             'driver',
    profileCompleted: true,
    approved:         true,
    emailVerified:    true,
    phone:            '+542804111111',
    activeRideId:     null,
    city:             'Rawson',
    driverStatus:     'offline',   // empieza offline, la demo lo pondrá online

    // Billetera: saldo positivo visible
    currentBalance:         5850,
    nonWithdrawableBalance: 0,

    // Vehículo para el perfil
    vehicleModel:            'Fiat Cronos',
    vehicleColor:            'Blanco',
    plateNumber:             'DEMO-123',
    carModelYear:            2022,
    serviceTier:             'premium',
    servicesOffered:         { premium: true, express: true },
    vehicleVerificationStatus: 'approved',
    driverMode:              'legal',
    municipalStatus:         'approved',
    canonStatus:             'active',

    // Nivel y puntos — ORO (100+ pts) para que el panel se vea completo
    driverLevel:  'oro',
    weeklyPoints: 112,

    // Código de referido del conductor
    referralCode: 'VAMOPRO',

    updatedAt: sv(),
};

// ─── Ubicación del conductor ──────────────────────────────────────────────────
const driverLocation: Record<string, any> = {
    geohash:         '69y7j',
    currentLocation: { lat: -43.3002, lng: -65.1023 },
    driverStatus:    'offline',
    approved:        true,
    isSuspended:     false,
    pendingOffers:   0,
    lastSeenAt:      sv(),
    updatedAt:       sv(),
};

// ─── Puntos semanales del conductor ──────────────────────────────────────────
const driverPoints: Record<string, any> = {
    weeklyPoints: 112,
    totalPoints:  2540,
    updatedAt:    sv(),
};

// ─── Config del pozo semanal ──────────────────────────────────────────────────
const rewardsConfig: Record<string, any> = {
    weeklyPoolAmount:    25750,
    minPointsToQualify: 20,
    updatedAt:           sv(),
};

// ─── Transacciones del conductor (billetera visible y rica) ───────────────────
const driverTransactions = [
    { type: 'ride_earning', amount:  800,  note: 'Viaje #2081 completado' },
    { type: 'ride_earning', amount:  1150, note: 'Viaje #2080 completado' },
    { type: 'commission',   amount: -150,  note: 'Comisión plataforma' },
    { type: 'topup',        amount:  2000, note: 'Carga vía Mercado Pago' },
    { type: 'reward',       amount:  1000, note: 'Premio Referido — Pepe R.' },
    { type: 'weekly_pool',  amount:  2500, note: 'Pozo Semanal — Nivel Oro' },
    { type: 'commission',   amount: -135,  note: 'Comisión plataforma' },
    { type: 'ride_earning', amount:  950,  note: 'Viaje #2078 completado' },
];

// ─── Referido del conductor (ya acreditado, para verse en la tab Perfil) ──────
const driverReferral: Record<string, any> = {
    referrerId:      DEMO_DRIVER_UID,
    referredId:      'fake_referred_driver_001',
    referredUserName:'Pepe Rodríguez',
    status:          'rewarded',
    createdAt:       admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
};

// ─── Referido del pasajero (acreditado) ──────────────────────────────────────
const passengerReferral: Record<string, any> = {
    referrerId:      DEMO_PASSENGER_UID,
    referredId:      'fake_referred_user_001',
    referredUserName:'María García',
    status:          'rewarded',
    createdAt:       admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)),
};

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('🌱 Iniciando seed de datos demo para VamO split-screen...\n');

    try {
        // 1. Config del pozo semanal
        console.log('[rewards] Configurando pozo semanal...');
        await db.collection('rewards').doc('rewards').set(rewardsConfig, { merge: true });

        // 2. Pasajero
        console.log('[passenger] Sembrando perfil de pasajero...');
        await db.collection('users').doc(DEMO_PASSENGER_UID).set(passengerData, { merge: true });

        // Referido del pasajero
        console.log('[passenger] Sembrando referido...');
        const pRefQuery = await db.collection('referrals')
            .where('referrerId', '==', DEMO_PASSENGER_UID).get();
        if (pRefQuery.empty) {
            await db.collection('referrals').add(passengerReferral);
        }

        // 3. Conductor
        console.log('[driver] Sembrando perfil del conductor...');
        await db.collection('users').doc(DEMO_DRIVER_UID).set(driverData, { merge: true });

        console.log('[driver] Sembrando ubicación...');
        await db.collection('drivers_locations').doc(DEMO_DRIVER_UID).set(driverLocation, { merge: true });

        console.log('[driver] Sembrando puntos semanales...');
        await db.collection('driver_points').doc(DEMO_DRIVER_UID).set(driverPoints, { merge: true });

        // Transacciones: limpiar las viejas y recrear para que se vean frescas
        console.log('[driver] Sembrando historial de transacciones...');
        const txCol = db.collection(`users/${DEMO_DRIVER_UID}/transactions`);
        const existingTxs = await txCol.get();
        // Borrar las existentes si hay pocas (primera vez o redemo)
        if (existingTxs.size < driverTransactions.length) {
            for (const doc of existingTxs.docs) {
                await doc.ref.delete();
            }
            for (const tx of driverTransactions) {
                await txCol.add({ ...tx, createdAt: sv() });
            }
        }

        // Referido del conductor
        console.log('[driver] Sembrando referido...');
        const dRefQuery = await db.collection('referrals')
            .where('referrerId', '==', DEMO_DRIVER_UID).get();
        if (dRefQuery.empty) {
            await db.collection('referrals').add(driverReferral);
        }

        console.log('\n✅ Seed completado exitosamente.');
        console.log('   Pasajero UID:', DEMO_PASSENGER_UID);
        console.log('   Conductor UID:', DEMO_DRIVER_UID);
        console.log('\n💡 Ejecutá ahora: npm run demo:vamo\n');

    } catch (error) {
        console.error('❌ Seed fallido:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

seed();
