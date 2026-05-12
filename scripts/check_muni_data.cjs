const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

async function main() {
    const db = admin.firestore();
    const snap = await db.collection('municipal_profiles').limit(5).get();
    console.log(`Municipal Profiles count: ${snap.size}`);
    snap.docs.forEach(d => console.log(`Profile ID: ${d.id}`));
    
    const usersSnap = await db.collection('users').where('role', '==', 'driver').limit(5).get();
    console.log(`Drivers in users count: ${usersSnap.size}`);
    usersSnap.docs.forEach(d => console.log(`User ID: ${d.id}, Name: ${d.data().name}`));
}

main().catch(console.error);
