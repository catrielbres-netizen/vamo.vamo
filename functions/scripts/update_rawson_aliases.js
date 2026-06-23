const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function updateRawson() {
    const rawsonRef = db.collection('cities').doc('rawson');
    await rawsonRef.set({
        cityKey: "rawson",
        municipalityName: "Rawson",
        province: "Chubut",
        country: "Argentina",
        enabled: true,
        aliases: [
            "Rawson",
            "Playa Unión",
            "Playa Union",
            "Puerto Rawson",
            "Área 12",
            "Area 12",
            "Área 16",
            "Area 16"
        ],
        localitiesIncluded: [
            "Rawson",
            "Playa Unión",
            "Puerto Rawson"
        ]
    }, { merge: true });
    console.log("Updated cities/rawson successfully.");
}

updateRawson().catch(console.error);
