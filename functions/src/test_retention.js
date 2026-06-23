const admin = require('firebase-admin');
const { testRetentionEmailsV1 } = require('../lib/retention');

// Inicializar la app
if (!admin.apps.length) {
    admin.initializeApp();
}

async function runTest() {
    try {
        console.log('Invocando testRetentionEmailsV1...');
        const result = await testRetentionEmailsV1.run({ auth: { uid: 'some-admin-uid' } });
        console.log('Resultado:', result);
        
        // Consultar mail_queue
        const db = admin.firestore();
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        console.log('Buscando en mail_queue con sufijo:', dateStr);
        
        const snap = await db.collection('mail_queue').orderBy('createdAt', 'desc').limit(10).get();
        console.log('Ultimos', snap.size, 'documentos en mail_queue:');
        snap.forEach(doc => {
            const data = doc.data();
            console.log('- ID:', doc.id, '| Status:', data.status, '| DedupeKey:', data.dedupeKey, '| To:', data.to);
        });

    } catch (e) {
        console.error('Error:', e);
    }
}
runTest();
