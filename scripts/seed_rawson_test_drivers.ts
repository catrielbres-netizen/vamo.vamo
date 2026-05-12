import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import * as geofire from 'geofire-common';

/**
 * [VamO FASE 5] Rawson Full Fleet Seeder (70 Drivers)
 */

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

const ZONES = [
    { name: "Rawson Centro", lat: -43.3002, lng: -65.1023 },
    { name: "Playa Unión", lat: -43.3345, lng: -65.0398 },
    { name: "Puerto Rawson", lat: -43.3385, lng: -65.0605 },
    { name: "Hospital", lat: -43.3051, lng: -65.1055 },
    { name: "Municipalidad", lat: -43.2981, lng: -65.1012 },
    { name: "Gregorio Mayo", lat: -43.2921, lng: -65.1102 },
    { name: "Área 12", lat: -43.2951, lng: -65.1152 },
    { name: "Área 16", lat: -43.3051, lng: -65.1182 },
    { name: "San Ramón", lat: -43.2851, lng: -65.0952 },
    { name: "Acceso Norte", lat: -43.2801, lng: -65.1002 },
    { name: "Salida Trelew", lat: -43.2951, lng: -65.1302 },
    { name: "Zona Costanera", lat: -43.3251, lng: -65.0402 },
    { name: "Periferia Sur", lat: -43.3201, lng: -65.1102 }
];

function getRandomCoord(base: number, offset: number = 0.005) {
    return base + (Math.random() - 0.5) * offset;
}

async function seedDrivers() {
    const args = process.argv.slice(2);
    const targetDrivers = parseInt(args.find(a => a.startsWith('--targetDrivers='))?.split('=')[1] || '70');
    const confirm = args.includes('--confirm');

    console.log(`\n====================================================`);
    console.log(`🚕 [SEED] Rawson Full Fleet Generator (FASE 5)`);
    console.log(`====================================================`);
    console.log(`📍 Target: ${targetDrivers} test drivers`);
    console.log(`⚠️ Mode: ${confirm ? 'EXECUTION' : 'DRY-RUN (use --confirm to write)'}`);
    console.log(`----------------------------------------------------\n`);

    const drivers = [];
    for (let i = 1; i <= targetDrivers; i++) {
        const zone = ZONES[i % ZONES.length];
        const lat = getRandomCoord(zone.lat);
        const lng = getRandomCoord(zone.lng);
        const driverId = `test_driver_rw_${i}`;

        drivers.push({
            id: driverId,
            name: `Test Driver ${i}`,
            zone: zone.name,
            lat,
            lng
        });
    }

    if (!confirm) {
        console.table(drivers.slice(0, 15).map(d => ({ ID: d.id, Name: d.name, Zone: d.zone, Lat: d.lat.toFixed(4), Lng: d.lng.toFixed(4) })));
        console.log(`... and ${drivers.length - 15} more.`);
        console.log(`\n✅ Dry-run complete. No changes made.`);
        return;
    }

    console.log(`🚀 Writing ${drivers.length} drivers to Firestore...`);

    const batchLimit = 450;
    let currentBatch = db.batch();
    let count = 0;

    for (const d of drivers) {
        const userRef = db.collection('users').doc(d.id);
        const locRef = db.collection('drivers_locations').doc(d.id);

        const userData = {
            name: d.name,
            email: `${d.id}@vamo.com`,
            role: 'driver',
            driverStatus: 'online',
            isTestDriver: true,
            approved: true,
            profileCompleted: true,
            isSuspended: false,
            activeRideId: null,
            cityKey: 'rawson',
            municipalStatus: 'approved',
            termsAccepted: true,
            termsVersion: 'v1.3',
            phone: '+5492804000000',
            vehicle: {
                brand: 'Toyota',
                model: 'Corolla (Test)',
                plate: `SIM-${d.id.slice(-3)}`,
                color: 'Blanco'
            },
            driverPreferences: {
                acceptsExpress: true,
                acceptsDiscountedRides: true,
                acceptsPets: true
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const locData = {
            driverId: d.id,
            driverStatus: 'online',
            isTestDriver: true,
            approved: true,
            isSuspended: false,
            cityKey: 'rawson',
            geohash: geofire.geohashForLocation([d.lat, d.lng]),
            currentLocation: new admin.firestore.GeoPoint(d.lat, d.lng),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        currentBatch.set(userRef, userData, { merge: true });
        currentBatch.set(locRef, locData, { merge: true });
        count += 2;

        if (count >= batchLimit) {
            await currentBatch.commit();
            console.log(`📦 Batch committed (${count} ops)`);
            currentBatch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await currentBatch.commit();
        console.log(`📦 Final batch committed (${count} ops)`);
    }

    console.log(`\n✅ [SEED] Finished. ${drivers.length} test drivers are ONLINE in Rawson.`);
    console.log(`====================================================\n`);
}

seedDrivers().catch(console.error);
