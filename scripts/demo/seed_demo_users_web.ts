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
    email: 'demo_passenger@vamo.com',
    password: '123456',
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
    password: '123456',
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
    password: '123456',
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
  console.log('🏁 Process finished.');
  process.exit(0);
}

run();
