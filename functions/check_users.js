const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "studio-6697160840-7c67f"
});

const db = admin.firestore();

async function check() {
    try {
        const pSnap = await db.collection('users').where('email', '==', 'chabelaedu@gmail.com').get();
        const dSnap = await db.collection('users').where('email', '==', 'eduedu@gmail.com').get();

        if (pSnap.empty) console.log('Passenger not found');
        else console.log('Passenger:', pSnap.docs[0].id, pSnap.docs[0].data());

        if (dSnap.empty) console.log('Driver not found');
        else {
            const driver = dSnap.docs[0].data();
            console.log('Driver:', dSnap.docs[0].id, {
                isOnline: driver.isOnline,
                role: driver.role,
                cityKey: driver.cityKey,
                approved: driver.approved,
                isSuspended: driver.isSuspended,
                location: driver.location
            });
        }
    } catch(e) {
        console.error(e);
    }
}

check();
