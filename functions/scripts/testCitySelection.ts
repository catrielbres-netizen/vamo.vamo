import * as admin from 'firebase-admin';
import fft from 'firebase-functions-test';
import { completeDriverRegistrationV1 } from '../src/onboarding';
import { completeDriverOnboardingV1 } from '../src/users';
import { canonicalCityKey } from '../src/lib/city';

try {
  const serviceAccount = require('../../service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  admin.initializeApp();
}

const testEnv = fft();
const db = admin.firestore();
const TEST_UID = 'test_city_driver_1';
const TEST_EMAIL = 'test_city_driver_1@example.com';

async function main() {
    console.log("--- TEST DE CANONICALIZACIÓN DE CIUDAD ---");
    
    // Cleanup first
    await db.collection('users').doc(TEST_UID).delete().catch(() => {});
    await db.collection('wallets').doc(TEST_UID).delete().catch(() => {});
    await db.collection('phone_index').doc('+5492804556677').delete().catch(() => {});
    
    // 1. Probar canonicalCityKey function
    console.log("Prueba unitaria de canonicalCityKey:");
    const testCases = ["rio-gallegos", "Río Gallegos", "rio_gallegos", "rawson", "Rawson"];
    for (const tc of testCases) {
        console.log(`  '${tc}' -> '${canonicalCityKey(tc)}'`);
    }

    // 2. Probar registration function con payload contaminado
    console.log("\nProbar completeDriverRegistrationV1 con 'rio-gallegos'");
    const wrappedReg = testEnv.wrap(completeDriverRegistrationV1);
    
    await wrappedReg({
        data: {
            cityKey: "rio-gallegos",
            city: "Río Gallegos",
            phone: "+5492804556677"
        },
        auth: {
            uid: TEST_UID,
            token: { email: TEST_EMAIL, email_verified: true, auth_time: 0, exp: 0, iat: 0, firebase: { identities: {}, sign_in_provider: 'password' }, sub: TEST_UID, uid: TEST_UID }
        }
    } as any);

    let docSnap = await db.collection('users').doc(TEST_UID).get();
    console.log("User en DB post-registration:");
    console.log(`cityKey: ${docSnap.data()?.cityKey}`);
    console.log(`city: ${docSnap.data()?.city}`);

    // 3. Probar onboarding function
    console.log("\nProbar completeDriverOnboardingV1 con 'rio-gallegos' y manual source");
    const wrappedOnboard = testEnv.wrap(completeDriverOnboardingV1);
    
    await wrappedOnboard({
        data: {
            name: "Test Driver",
            phone: "+5492804556677",
            vehicle: { brand: "Ford", model: "Fiesta", color: "Gris" },
            plateNumber: "AB123CD",
            carModelYear: "2015",
            driverSubtype: "independent",
            cityKey: "rio-gallegos",
            cityLabel: "Río Gallegos — Reclutamiento",
            cityResolutionStatus: "resolved",
            cityResolutionSource: "manual"
        },
        auth: {
            uid: TEST_UID,
            token: { email: TEST_EMAIL, email_verified: true, auth_time: 0, exp: 0, iat: 0, firebase: { identities: {}, sign_in_provider: 'password' }, sub: TEST_UID, uid: TEST_UID }
        }
    } as any);

    docSnap = await db.collection('users').doc(TEST_UID).get();
    console.log("User en DB post-onboarding:");
    const data = docSnap.data();
    console.log(`cityKey: ${data?.cityKey}`);
    console.log(`city: ${data?.city}`);
    console.log(`cityResolutionSource: ${data?.cityResolutionSource}`);
    console.log(`cityResolutionStatus: ${data?.cityResolutionStatus}`);

    // Cleanup
    await db.collection('users').doc(TEST_UID).delete().catch(() => {});
    await db.collection('wallets').doc(TEST_UID).delete().catch(() => {});
    await db.collection('phone_index').doc('+5492804556677').delete().catch(() => {});
    
    console.log("\n--- TEST FINALIZADO ---");
    testEnv.cleanup();
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    testEnv.cleanup();
    process.exit(1);
});
