const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function run() {
    const users = await db.collection('users').where('role', '==', 'driver').get();
    let eduardoId = null;
    users.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes('eduardo')) {
            eduardoId = doc.id;
            console.log(`Found Eduardo: ${eduardoId} - ${data.name}`);
        }
    });
    
    if (!eduardoId) {
        console.log("Eduardo not found!");
        return;
    }
    
    const pointsDoc = await db.collection('driver_points').doc(eduardoId).get();
    if (!pointsDoc.exists) {
        console.log(`No points doc for ${eduardoId}`);
        return;
    }
    const pData = pointsDoc.data();
    console.log(`Points doc for Eduardo:`, pData);
    
    if (pData.weekId) {
        const dists = await db.collection('weekly_pool_distributions').where('driverId', '==', eduardoId).get();
        console.log(`Distributions for Eduardo:`);
        dists.forEach(d => console.log(d.id, d.data()));
    }
}

run().then(() => process.exit(0)).catch(console.error);
