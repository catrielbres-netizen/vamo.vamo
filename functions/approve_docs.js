const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  try {
    const email = 'eduedu@gmail.com';
    console.log(`Buscando usuario con email: ${email}`);
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    console.log(`Usuario Auth encontrado: ${uid}`);

    // Update document_requests
    const docsRef = db.collection('users').doc(uid).collection('document_requests');
    const snapshot = await docsRef.get();
    
    let batch = db.batch();
    let count = 0;
    
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        status: 'approved',
        adminNote: admin.firestore.FieldValue.delete(),
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: 'system-script'
      });
      count++;
    });

    if (count > 0) {
      await batch.commit();
      console.log(`${count} documentos actualizados a 'approved' en document_requests.`);
    } else {
      console.log('No se encontraron document_requests para este usuario.');
    }
    
    // Also update any legacy documentStatus map in the main profile just in case
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
        const data = userDoc.data();
        let updates = {};
        if (data.documentStatus) {
            const newDocStatus = { ...data.documentStatus };
            let modified = false;
            for (const key of Object.keys(newDocStatus)) {
                newDocStatus[key] = 'approved';
                modified = true;
            }
            if (modified) {
                updates.documentStatus = newDocStatus;
            }
        }
        updates.hasMandatoryPendingDocs = false;
        await userRef.update(updates);
        console.log('Perfil principal actualizado.');
    }

    console.log('Proceso completado.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
