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

async function repairDriver() {
  const usersRef = db.collection('users');
  // Specifically targeting Eduardo's UID based on the diagnose script
  const eduardoUid = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
  
  console.log(`Buscando a Eduardo (${eduardoUid})...`);
  const docRef = usersRef.doc(eduardoUid);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    console.error('El documento de Eduardo no existe.');
    process.exit(1);
  }

  const beforeData = doc.data() || {};
  console.log('--- ESTADO ANTES ---');
  console.log(`profileCompleted: ${beforeData.profileCompleted}`);
  console.log(`docsStatus: ${beforeData.docsStatus}`);
  console.log(`municipalStatus: ${beforeData.municipalStatus}`);
  console.log(`planBStatus: ${beforeData.planBStatus}`);
  console.log(`onboardingStep: ${beforeData.onboardingStep}`);

  // Reseteamos su estado para que vuelva a pasar por el Onboarding de Plan B
  await docRef.update({
    profileCompleted: false, // Forzamos que vuelva al Onboarding
    docsStatus: admin.firestore.FieldValue.delete(), // Borramos el estado viejo
    municipalStatus: admin.firestore.FieldValue.delete(), // Borramos rastro municipal
    planBStatus: 'pending_docs', // Estado inicial de Plan B
    onboardingStep: admin.firestore.FieldValue.delete(), // Reseteamos paso
  });

  const afterDoc = await docRef.get();
  const afterData = afterDoc.data() || {};
  console.log('\n--- ESTADO DESPUÉS ---');
  console.log(`profileCompleted: ${afterData.profileCompleted}`);
  console.log(`docsStatus: ${afterData.docsStatus}`);
  console.log(`municipalStatus: ${afterData.municipalStatus}`);
  console.log(`planBStatus: ${afterData.planBStatus}`);
  console.log(`onboardingStep: ${afterData.onboardingStep}`);

  console.log('\n✅ Estado de Eduardo reseteado exitosamente para Plan B.');
}

repairDriver().then(() => process.exit(0)).catch(console.error);
