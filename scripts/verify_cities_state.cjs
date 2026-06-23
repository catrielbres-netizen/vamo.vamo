const admin = require('firebase-admin');
admin.initializeApp({ projectId: "studio-6697160840-7c67f" });

const db = admin.firestore();

async function main() {
  const rawson = await db.collection('cities').doc('rawson').get();
  console.log('--- RAWSON ---');
  console.log(JSON.stringify(rawson.data(), null, 2));

  const rio = await db.collection('cities').doc('rio_gallegos').get();
  console.log('--- RIO GALLEGOS ---');
  console.log(JSON.stringify(rio.data(), null, 2));
}

main().catch(console.error);
