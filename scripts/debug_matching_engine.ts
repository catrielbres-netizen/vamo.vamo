import admin from 'firebase-admin';
import * as geofire from 'geofire-common';
import * as fs from 'fs';

const sa = JSON.parse(fs.readFileSync('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function debugMatch() {
    const center = [-43.30, -65.04] as [number, number];
    const radiusInM = 2500; // Radio inicial
    const bounds = geofire.geohashQueryBounds(center, radiusInM);
    
    console.log('Bounds:', bounds);

    const snapshots = await Promise.all(bounds.map(b => {
        return db.collection('drivers_locations')
            .where('geohash', '>=', b[0])
            .where('geohash', '<=', b[1])
            .get();
    }));

    let found = false;
    snapshots.forEach((snap, i) => {
        console.log(`Bound ${i} has ${snap.size} docs`);
        snap.forEach(doc => {
            if (doc.id === 'hBBDZRKgBVQGetjHxZvNFst6pBg1') {
                found = true;
                console.log('FOUND DRIVER:', doc.id, doc.data().geohash);
            }
        });
    });

    if (!found) {
        console.log('DRIVER NOT FOUND IN BOUNDS');
        // Check exact geohash of the driver
        const d = (await db.doc('drivers_locations/hBBDZRKgBVQGetjHxZvNFst6pBg1').get()).data();
        console.log('Driver Geohash in DB:', d.geohash);
        console.log('Correct Geohash for [-43.3001, -65.0401]:', geofire.geohashForLocation([-43.3001, -65.0401]));
    }
}

debugMatch();
