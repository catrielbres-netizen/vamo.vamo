import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Load environment from .env.local to get project ID
dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

console.log(`📡 Connecting to Firebase project: ${projectId}`);

// Initialize Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: projectId,
  });
}

const db = getFirestore();
const serverTimestamp = FieldValue.serverTimestamp;

const DEMO_USERS = {
  passenger: {
    uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
    email: 'demo_passenger@vamo.com',
    data: {
      uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
      email: 'demo_passenger@vamo.com',
      name: 'Pasajero Demo',
      role: 'passenger',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      phone: '+542804000000',
      activeRideId: null,
      currentBalance: 0,
      serviceTier: 'premium',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  },
  driver: {
    uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
    email: 'demo_driver@vamo.com',
    data: {
      uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
      email: 'demo_driver@vamo.com',
      name: 'Chofer Demo',
      role: 'driver',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      phone: '+542804111111',
      currentBalance: 1000,
      driverStatus: 'offline',
      activeRideId: null,
      serviceTier: 'premium',
      servicesOffered: { premium: true, express: true },
      driverMode: 'legal',
      municipalStatus: 'approved',
      canonStatus: 'active',
      vehicleModel: 'Fiat Cronos',
      vehicleColor: 'Blanco',
      plateNumber: 'DEMO-123',
      vehicleVerificationStatus: 'approved',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    location: {
      geohash: '69y7j',
      currentLocation: { lat: -43.3002, lng: -65.1023 },
      driverStatus: 'offline',
      approved: true,
      isSuspended: false,
      pendingOffers: 0,
      updatedAt: serverTimestamp(),
    }
  },
  admin: {
    uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
    email: 'demo_admin@vamo.com',
    data: {
      uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
      email: 'demo_admin@vamo.com',
      name: 'Admin Demo',
      role: 'admin',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  }
};

async function seed() {
  console.log('🌱 Starting Seeding Process...');

  try {
    // 1. Seed Passenger
    console.log(`[PASSENGER] Seeding ${DEMO_USERS.passenger.uid}...`);
    await db.collection('users').doc(DEMO_USERS.passenger.uid).set(DEMO_USERS.passenger.data, { merge: true });

    // 2. Seed Admin
    console.log(`[ADMIN] Seeding ${DEMO_USERS.admin.uid}...`);
    await db.collection('users').doc(DEMO_USERS.admin.uid).set(DEMO_USERS.admin.data, { merge: true });

    // 3. Seed Driver
    console.log(`[DRIVER] Seeding ${DEMO_USERS.driver.uid}...`);
    await db.collection('users').doc(DEMO_USERS.driver.uid).set(DEMO_USERS.driver.data, { merge: true });
    
    console.log(`[DRIVER_LOCATION] Seeding location for ${DEMO_USERS.driver.uid}...`);
    await db.collection('drivers_locations').doc(DEMO_USERS.driver.uid).set(DEMO_USERS.driver.location, { merge: true });

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
