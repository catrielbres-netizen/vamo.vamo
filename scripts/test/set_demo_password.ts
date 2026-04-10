import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!admin.apps.length) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
  } else {
    admin.initializeApp();
  }
}

const auth = admin.auth();

const PASSENGER_EMAIL = 'demo_passenger@vamo.com';
const NEW_PASSWORD = 'DemoPass123!';

async function main() {
  const user = await auth.getUserByEmail(PASSENGER_EMAIL);
  await auth.updateUser(user.uid, { password: NEW_PASSWORD });
  console.log('Password set for demo passenger');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
