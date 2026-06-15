import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

const DEMO_PASSWORD = 'vamo2024pass';
const DEMO_CITY_KEY = 'rawson';

const DEMO_USERS = [
    {
        uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
        email: 'demo.superadmin@vamo.test',
        displayName: 'Superadmin Demo',
        claims: { role: 'admin', r: 'admin', superadmin: true, isSuperAdmin: true, ck: DEMO_CITY_KEY }
    },
    {
        uid: 'MUNI000000000000000000000001',
        email: 'demo.municipal@vamo.test',
        displayName: 'Municipal Demo',
        claims: { role: 'admin_municipal', r: 'admin_municipal', ck: DEMO_CITY_KEY }
    },
    {
        uid: 'TRAFFIC000000000000000000001',
        email: 'demo.transito@vamo.test',
        displayName: 'Tránsito Demo',
        claims: { role: 'traffic_municipal', r: 'traffic_municipal', ck: DEMO_CITY_KEY }
    },
    {
        uid: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
        email: 'demo.driver@vamo.test',
        displayName: 'Chofer Demo',
        claims: { role: 'driver', r: 'driver', ck: DEMO_CITY_KEY }
    },
    {
        uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
        email: 'demo.passenger@vamo.test',
        displayName: 'Pasajero Demo',
        claims: { role: 'passenger', r: 'passenger', ck: DEMO_CITY_KEY }
    }
];

async function createAccounts() {
    console.log('🛡️ Iniciando preparación segura de cuentas demo en Firebase Auth...');

    for (const user of DEMO_USERS) {
        try {
            // Check if user exists
            let userRecord;
            try {
                userRecord = await admin.auth().getUser(user.uid);
                console.log(`[INFO] Usuario ${user.email} ya existe en Auth.`);
                
                // Validate if it is a demo user (just to be safe, by email domain or explicit list)
                if (!userRecord.email?.endsWith('@vamo.test') && !userRecord.email?.endsWith('@vamo.com')) {
                    console.error(`[ERROR] ALERTA: El UID ${user.uid} pertenece a un usuario real (${userRecord.email}). ABORTANDO.`);
                    process.exit(1);
                }

                // Update password and displayName just in case
                await admin.auth().updateUser(user.uid, {
                    password: DEMO_PASSWORD,
                    displayName: user.displayName,
                    email: user.email
                });

            } catch (error: any) {
                if (error.code === 'auth/user-not-found') {
                    // Create user
                    console.log(`[CREATE] Creando usuario ${user.email}...`);
                    userRecord = await admin.auth().createUser({
                        uid: user.uid,
                        email: user.email,
                        password: DEMO_PASSWORD,
                        displayName: user.displayName,
                        emailVerified: true
                    });
                } else {
                    throw error;
                }
            }

            // Set Custom Claims
            console.log(`[CLAIMS] Asignando claims a ${user.email}...`, user.claims);
            await admin.auth().setCustomUserClaims(user.uid, user.claims);

            console.log(`✅ Usuario ${user.email} configurado correctamente.\n`);

        } catch (err: any) {
            console.error(`❌ Error al procesar usuario ${user.email}:`, err.message);
            process.exit(1);
        }
    }

    console.log('🏁 Proceso finalizado. Cuentas demo listas para usar.');
}

createAccounts().catch(console.error);
