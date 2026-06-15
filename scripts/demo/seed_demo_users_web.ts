import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import * as dotenv from 'dotenv';

// Load environment from .env.local to get Web Config
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log(`📡 Connecting to Firebase project: ${firebaseConfig.projectId}`);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const DEMO_USERS = {
  passenger: {
    uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
    email: 'demo.passenger@vamo.test',
    password: 'vamo2024pass',
    data: {
      uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
      email: 'demo.passenger@vamo.test',
      name: 'Pasajero Demo',
      role: 'passenger',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      phone: '+542804000000',
      activeRideId: null,
      currentBalance: 0,
      serviceTier: 'premium',
      cityKey: 'rawson',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  },
  driver: {
    uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
    email: 'demo.driver@vamo.test',
    password: 'vamo2024pass',
    data: {
      uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
      email: 'demo.driver@vamo.test',
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
      cityKey: 'rawson',
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
    email: 'demo.superadmin@vamo.test',
    password: 'vamo2024pass',
    data: {
      uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
      email: 'demo.superadmin@vamo.test',
      name: 'Superadmin Demo',
      role: 'admin',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      cityKey: 'rawson',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  },
  municipal: {
    uid: 'MUNI000000000000000000000001',
    email: 'demo.municipal@vamo.test',
    password: 'vamo2024pass',
    data: {
      uid: 'MUNI000000000000000000000001',
      email: 'demo.municipal@vamo.test',
      name: 'Municipal Demo',
      role: 'admin_municipal',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      cityKey: 'rawson',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  },
  traffic: {
    uid: 'TRAFFIC000000000000000000001',
    email: 'demo.transito@vamo.test',
    password: 'vamo2024pass',
    data: {
      uid: 'TRAFFIC000000000000000000001',
      email: 'demo.transito@vamo.test',
      name: 'Tránsito Demo',
      role: 'traffic_municipal',
      profileCompleted: true,
      approved: true,
      emailVerified: true,
      cityKey: 'rawson',
      city: 'Rawson',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  }
};

async function seedUser(userKey: keyof typeof DEMO_USERS) {
  const user = DEMO_USERS[userKey];
  console.log(`[${userKey.toUpperCase()}] Authenticating as ${user.email}...`);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
    console.log(`[${userKey.toUpperCase()}] Logged in. UID: ${userCredential.user.uid}`);
    
    console.log(`[${userKey.toUpperCase()}] Setting profile document...`);
    await setDoc(doc(db, 'users', user.uid), user.data, { merge: true });

    if ('location' in user) {
        console.log(`[${userKey.toUpperCase()}] Setting location document...`);
        await setDoc(doc(db, 'drivers_locations', user.uid), (user as any).location, { merge: true });
    }
    console.log(`✅ [${userKey.toUpperCase()}] Success.`);
  } catch (error: any) {
      console.error(`❌ [${userKey.toUpperCase()}] Failed:`, error.message);
  }
}

async function run() {
  console.log('🌱 Starting Web Seeding Process...');
  await seedUser('passenger');
  await seedUser('driver');
  await seedUser('admin');
  await seedUser('municipal');
  await seedUser('traffic');
  console.log('🏁 Process finished.');
  process.exit(0);
}

run();
