import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

const testUsers = [
    {
        email: "pasajero.compartido.test1@vamo.test",
        password: "VamoTest2026!_" + Math.floor(Math.random() * 1000),
        displayName: "VamO Pasajero Compartido Test 1"
    },
    {
        email: "pasajero.compartido.test2@vamo.test",
        password: "VamoTest2026!_" + Math.floor(Math.random() * 1000),
        displayName: "VamO Pasajero Compartido Test 2"
    },
    {
        email: "pasajero.compartido.test3@vamo.test",
        password: "VamoTest2026!_" + Math.floor(Math.random() * 1000),
        displayName: "VamO Pasajero Compartido Test 3"
    }
];

async function setupAlphaTestUsers() {
    console.log("Iniciando creación de usuarios de prueba...");
    const credentialsToSave: string[] = [];
    const userResults: any[] = [];

    for (const tu of testUsers) {
        let uid = "";
        try {
            // Check if user exists
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

        // Crear/Actualizar en Firestore
        const profileData = {
            uid: uid,
            email: tu.email,
            emailLower: tu.email.toLowerCase(),
            name: tu.displayName,
            role: "passenger",
            cityKey: "rawson",
            sharedRideAlphaTester: true,
            isTestUser: true,
            isSimulation: true,
            testPurpose: "shared_ride_alpha_testing",
            createdBy: "gemini_alpha_test_setup",
            status: "active",
            passengerStatus: "active",
            activeRideId: null,
            activeSharedRideId: null,
            activeSharedGroupId: null,
            onboardingCompleted: true,
            profileCompleted: true,
            termsAccepted: true,
            phoneVerified: true, // as required by prompt
            emailVerified: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(uid).set(profileData, { merge: true });
        console.log(`Perfil actualizado en Firestore para UID: ${uid}`);

        credentialsToSave.push(`Email: ${tu.email} | Password: ${tu.password} | UID: ${uid}`);
        userResults.push({ uid, email: tu.email });
    }

    // Save credentials file
    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    const credPath = path.join(reportsDir, 'shared_alpha_test_users_credentials.txt');
    
    let fileContent = `### CREDENCIALES DE PRUEBA ALPHA - VAMO COMPARTIDO ###\n`;
    fileContent += `¡ADVERTENCIA! Este archivo contiene contraseñas en texto claro. ELIMINAR después de la prueba.\n\n`;
    fileContent += credentialsToSave.join('\n');
    
    fs.writeFileSync(credPath, fileContent, 'utf-8');
    console.log(`\nCredenciales guardadas en: ${credPath}`);

    // Verify global state
    const doc = await db.doc('config/features').get();
    let requireAlphaTester = true;
    if (doc.exists) {
        requireAlphaTester = doc.data()?.sharedRide?.requireAlphaTester ?? true;
    }

    console.log(`\n=== REPORTE FINAL ===`);
    console.log(`requireAlphaTester global = ${requireAlphaTester}`);
    console.log(JSON.stringify(userResults, null, 2));

    process.exit(0);
}

setupAlphaTestUsers().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
