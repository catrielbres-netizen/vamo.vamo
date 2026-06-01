import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('No service account found!');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function diagnose() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('role', '==', 'driver').get();

  if (snapshot.empty) {
    console.log('No drivers found.');
    return;
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`\nUser: ${data.name} (${doc.id})`);
    console.log(`- email: ${data.email}`);
    console.log(`- role: ${data.role}`);
    console.log(`- driverSubtype: ${data.driverSubtype}`);
    console.log(`- profileCompleted: ${data.profileCompleted}`);
    console.log(`- docsStatus: ${data.docsStatus}`);
    console.log(`- municipalStatus: ${data.municipalStatus}`);
    console.log(`- planBStatus: ${data.planBStatus}`);
    console.log(`- driverStatus: ${data.driverStatus}`);
    console.log(`- onboardingStep: ${data.onboardingStep}`);
  }
}

diagnose().then(() => process.exit(0)).catch(console.error);
