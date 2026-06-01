const admin = require('firebase-admin');

// Ensure we initialize exactly like the actual backend
admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function run() {
  try {
    const pSnap = await db.doc('system_config/plan_b_pricing').get();
    console.log('--- plan_b_pricing ---');
    console.log('exists:', pSnap.exists);
    if (pSnap.exists) {
      console.log('data:', JSON.stringify(pSnap.data(), null, 2));
    }

    const lSnap = await db.doc('system_config/launch').get();
    console.log('\n--- launch ---');
    console.log('exists:', lSnap.exists);
    if (lSnap.exists) {
      console.log('data:', JSON.stringify(lSnap.data(), null, 2));
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

run().finally(() => process.exit(0));
