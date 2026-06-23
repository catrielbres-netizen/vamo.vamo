const admin = require('firebase-admin');
const serviceAccount = require('./vamo-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function findTestUsers() {
    const firestore = admin.firestore();
    const snapshot = await firestore.collection('users')
        .where('role', '==', 'driver')
        .limit(20)
        .get();

    if (snapshot.empty) {
        console.log("No drivers found.");
        return;
    }

    // Sort in memory to avoid missing index errors
    const users = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        users.push({
            id: doc.id,
            ...data,
            timestamp: data.createdAt?.toMillis?.() || 0
        });
    });

    users.sort((a, b) => b.timestamp - a.timestamp);

    users.slice(0, 10).forEach(data => {
        console.log(`UID: ${data.id} | Name: ${data.name} | Phone: ${data.phone} | RegCity: ${data.registrationCityKey} | GPSCity: ${data.currentLocationCityKey} | City: ${data.cityKey} | Date: ${data.createdAt?.toDate?.() || 'Unknown'}`);
    });
}

findTestUsers().catch(console.error);
