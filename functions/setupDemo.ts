
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const auth = admin.auth();
const db = admin.firestore();

async function setupDemoUsers() {
    const users = [
        {
            uid: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
            email: 'demo_passenger@vamo.com',
            password: '123456',
            role: 'passenger',
            name: 'Pasajero Demo'
        },
        {
            uid: 'RHL8qVAPDvgdSAYF8P6J3rTHEqs2',
            email: 'demo_admin@vamo.com',
            password: '123456',
            role: 'admin',
            name: 'Admin Demo'
        }
    ];

    for (const u of users) {
        console.log(`Setting up ${u.email}...`);
        try {
            await auth.createUser({
                uid: u.uid,
                email: u.email,
                password: u.password
            });
            console.log(`Auth user ${u.email} created.`);
        } catch (e: any) {
            if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') {
                console.log(`Auth user ${u.email} already exists. Updating password...`);
                await auth.updateUser(u.uid, { password: u.password });
            } else {
                throw e;
            }
        }

        await db.doc(`users/${u.uid}`).set({
            uid: u.uid,
            email: u.email,
            name: u.name,
            role: u.role,
            profileCompleted: true,
            approved: true,
            registrationStatus: 'active',
            onboardingCompleted: true,
            city: 'Rawson',
            cityKey: 'rawson',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`Firestore user ${u.email} updated.`);
    }
}

setupDemoUsers().catch(console.error);
