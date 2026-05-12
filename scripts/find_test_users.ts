import * as admin from 'firebase-admin';

async function main() {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'studio-6697160840-7c67f'
        });
    }
    const db = admin.firestore();
    const snap = await db.collection('users').where('role', '==', 'traffic_municipal').limit(1).get();
    if (snap.empty) {
        console.log("No traffic_municipal user found.");
        const anyMuni = await db.collection('users').where('role', 'in', ['admin_municipal', 'operator_municipal']).limit(1).get();
        if (!anyMuni.empty) {
            console.log("Found municipal user:", anyMuni.docs[0].id, anyMuni.docs[0].data().role);
        }
    } else {
        console.log("Found traffic_municipal user:", snap.docs[0].id);
    }
}

main().catch(console.error);
