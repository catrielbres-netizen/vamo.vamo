import admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();

async function applyChange() {
    const targetUid = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
    
    console.log(`\n🚀 Aplicando cambio a ${targetUid}...`);
    
    try {
        await db.doc(`users/${targetUid}`).update({
            sharedRideAlphaTester: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Update exitoso.`);
        
        // Verificar lectura
        const userDoc = await db.doc(`users/${targetUid}`).get();
        const data = userDoc.data() || {};
        console.log(`\n--- VERIFICACIÓN POST-ESCRITURA ---`);
        console.log(`sharedRideAlphaTester: ${data.sharedRideAlphaTester}`);
        
    } catch (e: any) {
        console.error("Error aplicando cambio:", e.message);
    }
}

applyChange().then(() => process.exit(0)).catch(console.error);
