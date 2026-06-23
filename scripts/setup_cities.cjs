const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
const db = admin.firestore();

async function run() {
    console.log("Setting up Rawson...");
    await db.doc('cities/rawson').set({
        cityKey: "rawson",
        name: "Rawson",
        province: "Chubut",
        country: "Argentina",
        enabled: true,
        operationalStatus: "active",
        passengerAccess: {
            enabled: true,
            marketingEnabled: true
        },
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("Setting up Río Gallegos...");
    await db.doc('cities/rio_gallegos').set({
        cityKey: "rio_gallegos",
        name: "Río Gallegos",
        province: "Santa Cruz",
        country: "Argentina",
        enabled: true,
        operationalStatus: "recruiting_drivers",
        driverRecruitment: {
            enabled: true,
            targetApprovedDrivers: 50,
            registeredDriversCount: 0,
            pendingDriversCount: 0,
            approvedDriversCount: 0,
            rejectedDriversCount: 0,
            enabledDriversCount: 0,
            readyForPassengerMarketing: false,
            estimatedLaunchDate: null,
            readyNotifiedAt: null
        },
        passengerAccess: {
            enabled: false,
            marketingEnabled: false
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("Done.");
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
