import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');

async function forceSetPasswords() {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        const db = admin.firestore();
        const auth = admin.auth();

        const targets = [
            { email: 'catrielbres@gmail.com', password: 'Musters123!' },
            { email: 'cesar.e2e@email.com', password: 'Musters123!' }
        ];

        for (const target of targets) {
            console.log(`\n🔒 Force resetting password for ${target.email}...`);
            try {
                const authUser = await auth.getUserByEmail(target.email);
                console.log(`- Found Auth User with UID: ${authUser.uid}`);

                await auth.updateUser(authUser.uid, {
                    password: target.password
                });
                console.log(`✅ Set password to "${target.password}" in Firebase Auth.`);

                await db.collection('users').doc(authUser.uid).update({
                    role: 'station_operator',
                    mustChangePassword: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Updated Firestore user document roles and mustChangePassword flag.`);
            } catch (err: any) {
                console.error(`❌ Error updating ${target.email}:`, err.message);
            }
        }

    } catch (e: any) {
        console.error("❌ Diagnostic error:", e.message);
    }
}

forceSetPasswords();
