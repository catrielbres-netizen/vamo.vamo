import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

const testUsers = [
    {
        email: "pasajero.rg1@vamo.test",
        password: "VamoTest2026!_" + Math.floor(Math.random() * 1000),
        displayName: "Pasajero Río Gallegos 1"
    },
    {
        email: "pasajero.rg2@vamo.test",
        password: "VamoTest2026!_" + Math.floor(Math.random() * 1000),
        displayName: "Pasajero Río Gallegos 2"
    }
];

async function createPassengers() {
    console.log("Iniciando creación de 2 pasajeros en Río Gallegos...");

    for (const tu of testUsers) {
        let uid = "";
        try {
            const existingUser = await auth.getUserByEmail(tu.email);
            uid = existingUser.uid;
            console.log(`Usuario ya existe en Auth: ${tu.email} (${uid}). Actualizando password...`);
            await auth.updateUser(uid, {
                password: tu.password,
                displayName: tu.displayName,
                emailVerified: true
            });
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                console.log(`Creando usuario en Auth: ${tu.email}...`);
                const newUser = await auth.createUser({
                    email: tu.email,
                    password: tu.password,
                    displayName: tu.displayName,
                    emailVerified: true
                });
                uid = newUser.uid;
            } else {
                throw err;
            }
        }

        const profileData = {
            uid: uid,
            email: tu.email,
            emailLower: tu.email.toLowerCase(),
            name: tu.displayName,
            role: "passenger",
            cityKey: "rio_gallegos",
            status: "active",
            passengerStatus: "active",
            onboardingCompleted: true,
            profileCompleted: true,
            termsAccepted: true,
            phoneVerified: true,
            emailVerified: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(uid).set(profileData, { merge: true });
        console.log(`\n================================`);
        console.log(`PASAJERO CREADO EXITOSAMENTE`);
        console.log(`Email: ${tu.email}`);
        console.log(`Clave: ${tu.password}`);
        console.log(`UID: ${uid}`);
        console.log(`Ciudad: Río Gallegos`);
        console.log(`================================\n`);
    }

    console.log(`¡Pasajeros creados!`);
    process.exit(0);
}

createPassengers().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
