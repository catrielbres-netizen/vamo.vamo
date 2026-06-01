const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function run() {
  try {
    const planBRef = db.doc('system_config/plan_b_pricing');
    const launchRef = db.doc('system_config/launch');

    const pricingData = {
      baseFare: 1000,
      pricePer100m: 100,
      pricePerMinute: 150,
      minimumFare: 1200,
      discountVsReferencePercent: 30,
      enabled: true,
      source: "manual_plan_b_initial_config",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const launchData = {
      rawson: {
        status: "active",
        requiredDrivers: 25,
        currentDrivers: 25,
        rideRequestsEnabled: true,
        passengerRegistrationEnabled: true,
        message: "VamO ya está activo en Rawson."
      },
      playa_union: {
        status: "active",
        requiredDrivers: 25,
        currentDrivers: 25,
        rideRequestsEnabled: true,
        passengerRegistrationEnabled: true,
        message: "VamO ya está activo en Playa Unión."
      },
      trelew: {
        status: "driver_recruitment",
        requiredDrivers: 25,
        currentDrivers: 0,
        rideRequestsEnabled: false,
        passengerRegistrationEnabled: true,
        message: "VamO está cargando conductores en Trelew. Faltan 25 conductores para activar los viajes."
      },
      corrientes: {
        status: "driver_recruitment",
        requiredDrivers: 25,
        currentDrivers: 0,
        rideRequestsEnabled: false,
        passengerRegistrationEnabled: true,
        message: "VamO está cargando conductores en Corrientes. Faltan 25 conductores para activar los viajes."
      }
    };

    console.log('Writing plan_b_pricing...');
    await planBRef.set(pricingData, { merge: true });

    console.log('Writing launch...');
    await launchRef.set(launchData, { merge: true });

    console.log('--- Verification ---');
    const pSnap = await planBRef.get();
    console.log('plan_b_pricing path:', planBRef.path);
    console.log('plan_b_pricing exists:', pSnap.exists);
    if (pSnap.exists) {
      console.log('data:', JSON.stringify(pSnap.data(), null, 2));
    }

    const lSnap = await launchRef.get();
    console.log('\nlaunch path:', launchRef.path);
    console.log('launch exists:', lSnap.exists);
    if (lSnap.exists) {
      console.log('data:', JSON.stringify(lSnap.data(), null, 2));
    }
    
  } catch (error) {
    console.error('Error in script:', error);
  }
}

run().finally(() => process.exit(0));
