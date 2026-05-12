import admin from 'firebase-admin';

// Inlined helpers to avoid import issues
function getArgentinaDateStr(): string {
    const d = new Date();
    const argDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const y = argDate.getFullYear();
    const m = String(argDate.getMonth() + 1).padStart(2, '0');
    const day = String(argDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Initialize Admin
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f' // Project ID from .firebaserc
    });
}

const db = admin.firestore();
const todayStr = getArgentinaDateStr();

async function runAudit() {
    console.log('🚀 Starting Full Financial Audit (V8)');
    
    // 1. Setup Test Users
    const driverId = 'audit_driver_v8';
    const passengerId = 'audit_passenger_v8';
    const cityKey = 'rawson';

    console.log('🛠️ Seeding Audit Users...');
    await db.collection('users').doc(driverId).set({
        uid: driverId,
        name: 'Audit Driver V8',
        role: 'driver',
        driverSubtype: 'particular',
        currentBalance: 0,
        cityKey: cityKey,
        isTest: true,
        dailyStats: {
            ridesCount: 0,
            earningsDaily: 0,
            todayCash: 0,
            todayDigital: 0,
            kilometersDaily: 0,
            lastResetDate: todayStr
        }
    });

    // Seed Driver Location (Required for settlement status update)
    await db.collection('drivers_locations').doc(driverId).set({
        driverId,
        driverStatus: 'online',
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        cityKey
    });

    await db.collection('users').doc(passengerId).set({
        uid: passengerId,
        name: 'Audit Passenger V8',
        role: 'passenger',
        currentBalance: 50000, // Rich passenger for testing VPay
        cityKey: cityKey,
        isTest: true
    });

    // Seed City Pricing (VamO PRO schema)
    const pricingConfig = {
        version: 1,
        DAY_BASE_FARE: 1400,
        DAY_PRICE_PER_100M: 152,
        DAY_WAITING_PER_MIN: 220,
        NIGHT_BASE_FARE: 1652,
        NIGHT_PRICE_PER_100M: 189,
        NIGHT_WAITING_PER_MIN: 277,
        MINIMUM_FARE: 2000,
        PLATFORM_COMMISSION_RATE: 0.14,
        commission_particular: 0.14,
        commission_taxi_remis: 0.08,
        municipal_percentage: 0.02,
        ASSISTANCE_FEE: 400,
        assistanceEnabled: true
    };

    await db.collection('cities').doc(cityKey).set({
        cityKey,
        name: 'Rawson',
        status: 'active',
        pricing: pricingConfig
    }, { merge: true });

    const tripConfigs = [
        { pay: 'cash', type: 'particular' },
        { pay: 'wallet', type: 'professional' },
        { pay: 'wallet_partial', type: 'particular' },
        { pay: 'cash', type: 'professional' },
    ];

    const results = [];

    for (let i = 0; i < 20; i++) {
        const config = tripConfigs[i % tripConfigs.length];
        const rideId = `audit_ride_${i}_${Date.now()}`;
        
        console.log(`\n🚙 [${i+1}/20] Processing ${config.pay} ride (${config.type})...`);

        // Create Ride
        const rideRef = db.collection('rides').doc(rideId);
        const distance = 5000; // 5km
        const duration = 600; // 10 min
        
        const pricing = {
            total: 2500, // Mocked total for simplicity
            subtotal: 2500,
            distance: 2500,
            time: 0,
            base: 0
        };

        const walletCovered = config.pay === 'wallet' ? 2500 : (config.pay === 'wallet_partial' ? 500 : 0);
        const cashToCollect = 2500 - walletCovered;

        await rideRef.set({
            id: rideId,
            passengerId,
            driverId,
            cityKey,
            status: 'completed',
            isTest: true,
            serviceType: config.type,
            paymentMethod: config.pay === 'wallet' || config.pay === 'wallet_partial' ? 'wallet' : 'cash',
            pricing: {
                total: 2500,
                basePrice: 1000,
                distancePrice: 1000,
                timePrice: 500
            },
            distanceMeters: distance,
            durationSeconds: duration,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Trigger Settlement via Firestore Update (Production Trigger)
        try {
            // First create as in_progress
            await rideRef.set({
                id: rideId,
                passengerId,
                driverId,
                cityKey,
                status: 'in_progress', // Initial status
                isTest: true,
                serviceType: config.type,
                paymentMethod: config.pay === 'wallet' || config.pay === 'wallet_partial' ? 'wallet' : 'cash',
                pricing: {
                    estimatedTotal: 2500,
                    basePrice: 1400,
                    distancePrice: 1000,
                    timePrice: 100,
                    pricingSnapshot: pricingConfig
                },
                driverSubtypeSnapshot: config.type,
                distanceMeters: distance,
                durationSeconds: duration,
                startedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Wait for emulator to register the creation
            await new Promise(r => setTimeout(r, 1000));

            // Trigger the onDocumentUpdated
            await rideRef.update({ 
                status: 'completed',
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`⏱️ Waiting for settlement logic to complete...`);
            
            // Poll for settledAt
            let settled = false;
            for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise(r => setTimeout(r, 1000));
                const snap = await rideRef.get();
                if (snap.data()?.settledAt) {
                    settled = true;
                    break;
                }
            }

            if (!settled) {
                console.error(`⚠️ Settlement timeout for ${rideId}. Check logs.`);
            }
            
            // Validate Results
            const rideSnap = await rideRef.get();
            const rData = rideSnap.data();
            const dSnap = await db.collection('users').doc(driverId).get();
            const dData = dSnap.data();
            const pSnap = await db.collection('users').doc(passengerId).get();
            const pData = pSnap.data();

            results.push({
                rideId,
                type: config.type,
                pay: config.pay,
                status: rData?.settledAt ? 'SETTLED' : 'FAILED',
                net: rData?.completedRide?.driverNetAmount,
                dBalance: dData?.currentBalance,
                dRides: dData?.dailyStats?.ridesCount,
                dMissions: dData?.dailyStats?.missionsCompleted?.length || 0,
                pBalance: pData?.currentBalance
            });

        } catch (err) {
            console.error(`❌ Ride ${i} failed:`, err);
        }
    }

    console.log('\n--- AUDIT FINAL REPORT ---');
    console.table(results);
}

runAudit().catch(console.error);
