/**
 * seed_demo_data.ts
 *
 * Siembra en Firestore todos los datos necesarios para que la demo splits-screen
 * se vea completa, real y profesional.
 *
 * USO:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\catri\vamo.vamo\service-account.json"
 *   npx tsx scripts/demo/seed_demo_data.ts
 *
 * REQUIERE:
 *   - Variables de entorno en .env.local
 *   - GOOGLE_APPLICATION_CREDENTIALS válido
 */

import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

// ─── Inicializar Firebase Admin ───────────────────────────────────────────────
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();
const sv = admin.firestore.FieldValue.serverTimestamp;

// ─── UIDs de usuarios demo autorizados ────────────────────────────────────────
const ALLOWED_UIDS = {
    ADMIN: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
    MUNICIPAL: 'MUNI000000000000000000000001',
    TRAFFIC: 'TRAFFIC000000000000000000001',
    DRIVER: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
    PASSENGER: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
};

const DEMO_FLAGS = {
    cityKey: 'rawson',
    city: 'Rawson',
    demo: true,
    isDemo: true,
    updatedAt: sv(),
};

// ─── Datos de los Perfiles Demo ────────────────────────────────────────────────
const adminData = {
    uid: ALLOWED_UIDS.ADMIN,
    email: 'demo.superadmin@vamo.test',
    name: 'Superadmin Demo',
    role: 'admin',
    profileCompleted: true,
    approved: true,
    emailVerified: true,
    ...DEMO_FLAGS,
};

const municipalData = {
    uid: ALLOWED_UIDS.MUNICIPAL,
    email: 'demo.municipal@vamo.test',
    name: 'Municipal Demo',
    role: 'admin_municipal',
    profileCompleted: true,
    approved: true,
    emailVerified: true,
    ...DEMO_FLAGS,
};

const trafficData = {
    uid: ALLOWED_UIDS.TRAFFIC,
    email: 'demo.transito@vamo.test',
    name: 'Tránsito Demo',
    role: 'traffic_municipal',
    profileCompleted: true,
    approved: true,
    emailVerified: true,
    ...DEMO_FLAGS,
};

const passengerData = {
    uid: ALLOWED_UIDS.PASSENGER,
    email: 'demo.passenger@vamo.test',
    name: 'Pasajero Demo',
    role: 'passenger',
    profileCompleted: true,
    approved: true,
    emailVerified: true,
    phone: '+542804000000',
    activeRideId: null,
    passengerProgress: { level: 2, monthlyRides: 8 },
    welcomeBonus: { available: true, used: false },
    referralCode: 'VAMOFRIEND',
    ...DEMO_FLAGS,
};

const driverData = {
    uid: ALLOWED_UIDS.DRIVER,
    email: 'demo.driver@vamo.test',
    name: 'Chofer Demo',
    role: 'driver',
    profileCompleted: true,
    approved: true,
    emailVerified: true,
    phone: '+542804111111',
    activeRideId: null,
    driverStatus: 'offline',
    currentBalance: 5850,
    nonWithdrawableBalance: 0,
    vehicleModel: 'Fiat Cronos',
    vehicleColor: 'Blanco',
    plateNumber: 'DEMO-123',
    carModelYear: 2022,
    serviceTier: 'premium',
    servicesOffered: { premium: true, express: true },
    vehicleVerificationStatus: 'approved',
    driverMode: 'legal',
    municipalStatus: 'approved',
    canonStatus: 'active',
    driverLevel: 'oro',
    weeklyPoints: 112,
    referralCode: 'VAMOPRO',
    ...DEMO_FLAGS,
};

// ─── Ubicación del conductor ──────────────────────────────────────────────────
const driverLocation = {
    geohash: '69y7j',
    currentLocation: { lat: -43.3002, lng: -65.1023 },
    driverStatus: 'offline',
    approved: true,
    isSuspended: false,
    pendingOffers: 0,
    lastSeenAt: sv(),
    ...DEMO_FLAGS,
};

// ─── Puntos semanales del conductor ──────────────────────────────────────────
const driverPoints = {
    weeklyPoints: 112,
    totalPoints: 2540,
    ...DEMO_FLAGS,
};

// ─── Config del pozo semanal ──────────────────────────────────────────────────
const rewardsConfig = {
    weeklyPoolAmount: 25750,
    minPointsToQualify: 20,
    ...DEMO_FLAGS,
};

// ─── Transacciones del conductor (billetera visible y rica) ───────────────────
const driverTransactions = [
    { type: 'ride_earning', amount: 800, note: 'Viaje #2081 completado' },
    { type: 'ride_earning', amount: 1150, note: 'Viaje #2080 completado' },
    { type: 'commission', amount: -150, note: 'Comisión plataforma' },
    { type: 'topup', amount: 2000, note: 'Carga vía Mercado Pago' },
    { type: 'reward', amount: 1000, note: 'Premio Referido — Pepe R.' },
    { type: 'weekly_pool', amount: 2500, note: 'Pozo Semanal — Nivel Oro' },
    { type: 'commission', amount: -135, note: 'Comisión plataforma' },
    { type: 'ride_earning', amount: 950, note: 'Viaje #2078 completado' },
].map(tx => ({ ...tx, ...DEMO_FLAGS, createdAt: sv() }));

// ─── Referido del conductor ───────────────────────────────────────────────────
const driverReferral = {
    referrerId: ALLOWED_UIDS.DRIVER,
    referredId: 'fake_referred_driver_001',
    referredUserName: 'Pepe Rodríguez',
    status: 'rewarded',
    createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
    ...DEMO_FLAGS,
};

// ─── Referido del pasajero ────────────────────────────────────────────────────
const passengerReferral = {
    referrerId: ALLOWED_UIDS.PASSENGER,
    referredId: 'fake_referred_user_001',
    referredUserName: 'María García',
    status: 'rewarded',
    createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)),
    ...DEMO_FLAGS,
};

// ─── Utilidad para escribir con seguridad ──────────────────────────────────────
async function safeSetUser(uid: string, data: any) {
    if (!Object.values(ALLOWED_UIDS).includes(uid)) {
        throw new Error(`[SECURITY] Intento de escritura en UID no autorizado: ${uid}`);
    }
    console.log(`[users] Escribiendo perfil de ${data.role}...`);
    // Asegurar fecha de creación si no existe
    await db.collection('users').doc(uid).set({ ...data, createdAt: sv() }, { merge: true });
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('🌱 Iniciando seed consolidado de datos demo (Admin SDK)...\n');

    try {
        // 1. Configuración de Recompensas
        console.log('[rewards] Configurando pozo semanal...');
        await db.collection('rewards').doc('rewards').set(rewardsConfig, { merge: true });

        // 2. Perfiles Demo (Pasajero, Conductor, Admin, Muni, Traffic)
        await safeSetUser(ALLOWED_UIDS.ADMIN, adminData);
        await safeSetUser(ALLOWED_UIDS.MUNICIPAL, municipalData);
        await safeSetUser(ALLOWED_UIDS.TRAFFIC, trafficData);
        await safeSetUser(ALLOWED_UIDS.PASSENGER, passengerData);
        await safeSetUser(ALLOWED_UIDS.DRIVER, driverData);

        // 3. Ubicación del Conductor
        console.log('[driver] Sembrando ubicación...');
        await db.collection('drivers_locations').doc(ALLOWED_UIDS.DRIVER).set({ ...driverLocation, createdAt: sv() }, { merge: true });

        // 4. Puntos del Conductor
        console.log('[driver] Sembrando puntos semanales...');
        await db.collection('driver_points').doc(ALLOWED_UIDS.DRIVER).set({ ...driverPoints, createdAt: sv() }, { merge: true });

        // 5. Transacciones
        console.log('[driver] Sembrando historial de transacciones...');
        const txCol = db.collection(`users/${ALLOWED_UIDS.DRIVER}/transactions`);
        const existingTxs = await txCol.get();
        if (existingTxs.size < driverTransactions.length) {
            for (const doc of existingTxs.docs) {
                await doc.ref.delete();
            }
            for (const tx of driverTransactions) {
                await txCol.add(tx);
            }
        }

        // 6. Referidos
        console.log('[referrals] Sembrando referidos...');
        const pRefQuery = await db.collection('referrals').where('referrerId', '==', ALLOWED_UIDS.PASSENGER).get();
        if (pRefQuery.empty) await db.collection('referrals').add(passengerReferral);

        const dRefQuery = await db.collection('referrals').where('referrerId', '==', ALLOWED_UIDS.DRIVER).get();
        if (dRefQuery.empty) await db.collection('referrals').add(driverReferral);

        console.log('\n✅ Seed consolidado completado exitosamente.');
        console.log('💡 Ejecutá ahora: npm run demo:vamo\n');

    } catch (error) {
        console.error('❌ Seed fallido:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

seed();
