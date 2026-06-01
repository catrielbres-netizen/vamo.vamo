import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account not found at ${serviceAccountPath}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath)
});

async function enableAlphaTesters(emails: string[]) {
  const db = admin.firestore();
  console.log(`🚀 Enabling Alpha Testers for: ${emails.join(', ')}`);

  for (const email of emails) {
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) {
      console.log(`❌ User not found: ${email}`);
      continue;
    }
    const userDoc = userSnap.docs[0];
    await userDoc.ref.update({
      sharedRideAlphaTester: true
    });
    console.log(`✅ Enabled Alpha Tester: ${email} (${userDoc.id})`);
  }
}

const emails = process.argv.slice(2);
if (emails.length === 0) {
  console.log("Usage: npx ts-node scripts/admin/enable_alpha_testers.ts email1 email2 ...");
} else {
  enableAlphaTesters(emails).then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
