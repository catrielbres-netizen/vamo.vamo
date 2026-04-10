// scripts/test/validate_ride_flow.ts

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import admin from 'firebase-admin';
import * as geofire from 'geofire-common';
import { resolvePricingMunicipality } from '../../functions/src/lib/territoryResolver';
import { findNextDriverAndCreateOffer } from '../../functions/src/rides';

// ------------------------------------------------------------------
// 1️⃣ INITIALIZATION
// ------------------------------------------------------------------
if (!admin.apps.length) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
const auth = admin.auth();

const PASSENGER_EMAIL = 'demo_passenger@vamo.com';
const DRIVER_EMAIL = 'demo_driver@vamo.com';
const CURRENT_TERMS_V = 'v1.3';

// Rawson, Chubut coordinates (used for all scenarios)
const RAWSON_ORIGIN = {
  address: "General Conesa 450, Rawson, Chubut",
  lat: -43.300123,
  lng: -65.102345,
  city: "Rawson",
};

const RAWSON_DESTINATION = {
  address: "Plaza Guillermo Rawson, Chubut",
  lat: -43.300500,
  lng: -65.105000,
  city: "Rawson",
};

async function logStep(step: string, details?: any) {
  console.log(`\n🔷 [STEP] ${step}`);
  if (details) console.log(JSON.stringify(details, null, 2));
}

interface Scenario {
  name: string;
  clientCityKey?: string | null;
  clientCityName?: string | null;
  expectedKey: string;
}

const scenarios: Scenario[] = [
  {
    name: 'A - Rawson normal (client supplies correct cityKey)',
    clientCityKey: 'rawson',
    expectedKey: 'rawson',
  },
  {
    name: 'B - Playa Unión alias (city name only)',
    clientCityName: 'Playa Union',
    expectedKey: 'rawson',
  },
  {
    name: 'C - Manipulated cityKey (trelew) with rawson coords',
    clientCityKey: 'trelew',
    expectedKey: 'rawson',
  },
  {
    name: 'D - Unknown city string but rawson coords',
    clientCityName: 'Some Unknown Place',
    expectedKey: 'rawson',
  },
];

async function prepareDemoUsers() {
  const passengerUser = await auth.getUserByEmail(PASSENGER_EMAIL);
  const driverUser = await auth.getUserByEmail(DRIVER_EMAIL);
  const pUid = passengerUser.uid;
  const dUid = driverUser.uid;

  await logStep('Preparing Demo Users', { passenger: pUid, driver: dUid });

  await db.doc(`users/${pUid}`).set(
    {
      uid: pUid,
      email: PASSENGER_EMAIL,
      role: 'passenger',
      profileCompleted: true,
      emailVerified: true,
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_V,
      activeRideId: null,
      cityKey: 'rawson',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const driverProfile = {
    uid: dUid,
    email: DRIVER_EMAIL,
    role: 'driver',
    approved: true,
    profileCompleted: true,
    emailVerified: true,
    acceptedDriverTerms: true,
    termsAccepted: true,
    termsVersion: CURRENT_TERMS_V,
    driverStatus: 'online',
    isSuspended: false,
    currentBalance: 5000,
    activeRideId: null,
    cityKey: 'rawson',
    servicesOffered: {
      normal: true,
      premium: true,
      express: true,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.doc(`users/${dUid}`).set(driverProfile, { merge: true });

  const center = [RAWSON_ORIGIN.lat, RAWSON_ORIGIN.lng];
  const hash = geofire.geohashForLocation(center as [number, number]);
  const driverLoc = {
    geohash: hash,
    currentLocation: { lat: RAWSON_ORIGIN.lat, lng: RAWSON_ORIGIN.lng },
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    driverStatus: 'online',
    approved: true,
    isSuspended: false,
    pendingOffers: 0,
    cityKey: 'rawson',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.doc(`drivers_locations/${dUid}`).set(driverLoc);
  await logStep('Driver and Passenger ready in Rawson');
  return { pUid, dUid };
}

async function runScenario(s: Scenario, pUid: string, dUid: string) {
  await logStep(`Running scenario: ${s.name}`);

  const resolution = resolvePricingMunicipality({
    cityKey: s.clientCityKey ?? null,
    city: s.clientCityName ?? null,
    lat: RAWSON_ORIGIN.lat,
    lng: RAWSON_ORIGIN.lng,
  });
  await logStep('Territory resolution result', resolution);

  if (resolution.pricingMunicipalityKey !== s.expectedKey) {
    console.error(`❌ Scenario ${s.name} failed resolution. Expected ${s.expectedKey}, got ${resolution.pricingMunicipalityKey}`);
    return;
  }

  const rideId = `test_${s.name.replace(/\s+/g, '_')}_${Date.now()}`;
  const rideRef = db.doc(`rides/${rideId}`);

  const rideData: any = {
    passengerId: pUid,
    passengerName: 'Passenger Demo',
    origin: RAWSON_ORIGIN,
    destination: RAWSON_DESTINATION,
    serviceType: 'normal',
    status: 'searching',
    city: RAWSON_ORIGIN.city,
    cityKey: s.clientCityKey ?? null,
    pricing: { estimated: { total: 1500, breakdown: { base: 1000, distance: 500 }, calculatedAt: admin.firestore.FieldValue.serverTimestamp() } },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    matchingAttempts: 0,
    notifiedDrivers: [],
  };

  await rideRef.set(rideData);
  await db.doc(`users/${pUid}`).update({ activeRideId: rideId });

  await findNextDriverAndCreateOffer(rideId);
  await new Promise(r => setTimeout(r, 3000));

  const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
  if (offersSnap.empty) {
    console.warn('⚠️ No offer created – may be index issue.');
  } else {
    const offer = offersSnap.docs[0].data();
    await logStep('Created offer data', { offerId: offersSnap.docs[0].id, cityKey: offer.cityKey });
    if (offer.cityKey !== s.expectedKey) {
      console.error(`❌ Offer cityKey mismatch. Expected ${s.expectedKey}, got ${offer.cityKey}`);
    } else {
      console.log('✅ Offer cityKey matches expected resolved key.');
    }
  }

  // Cleanup
  await db.collection('rideOffers').where('rideId', '==', rideId).get().then(snap => {
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  });
  await rideRef.delete();
}

async function main() {
  console.log('🚀 Starting Ride Flow Validation Script with Territorial Scenarios...');
  const { pUid, dUid } = await prepareDemoUsers();

  for (const s of scenarios) {
    await runScenario(s, pUid, dUid);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('✅ All scenarios completed.');
}

main().catch(err => console.error('Fatal error in validation script:', err));
