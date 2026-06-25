const admin = require('firebase-admin');

// Initialize Firebase
admin.initializeApp({
  projectId: "studio-6697160840-7c67f"
});

const db = admin.firestore();

async function sendTestEmail() {
    const to = "cesareduardobres@gmail.com";
    const templateName = "driver_enabled";
    
    console.log(`Enqueuing test email to ${to} using template: ${templateName}`);
    
    const docRef = await db.collection('mail_queue').add({
        to: to,
        template: templateName,
        subject: '¡Tu cuenta de conductor fue habilitada! (PRUEBA LINK)',
        data: {
            name: "Conductor de Prueba",
        },
        status: 'queued',
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'manual_test_script'
    });
    
    console.log(`Email enqueued with ID: ${docRef.id}`);
}

sendTestEmail().catch(console.error).finally(() => process.exit(0));
