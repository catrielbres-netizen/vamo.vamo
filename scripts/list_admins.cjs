const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

async function main() {
    const db = admin.firestore();
    const snap = await db.collection('users').where('role', 'in', ['admin', 'admin_municipal']).limit(5).get();
    snap.docs.forEach(d => {
        const data = d.data();
        console.log(`Email: ${data.email} | Role: ${data.role} | City: ${data.cityKey}`);
    });
}

main().catch(console.error);
