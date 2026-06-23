import admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();

async function preflightCheck() {
    // Extracted from the production Firebase Function logs
    const targetUid = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
    
    console.log(`\n🔍 Verificando usuario objetivo: ${targetUid}`);
    
    try {
        const userDoc = await db.doc(`users/${targetUid}`).get();
        if (!userDoc.exists) {
            console.log(`❌ El usuario ${targetUid} no existe en la base de datos.`);
            process.exit(1);
        }
        
        const data = userDoc.data() || {};
        
        const rawName = data.name || data.firstName || '';
        const maskedName = rawName.length > 2 ? rawName.substring(0, 2) + '***' : '***';
        
        const rawEmail = data.email || '';
        const maskedEmail = rawEmail.includes('@') ? 
            `${rawEmail.split('@')[0].substring(0, 3)}***@${rawEmail.split('@')[1]}` : 'Sin email';

        console.log(`--- PERFIL ENCONTRADO ---`);
        console.log(`UID: ${targetUid}`);
        console.log(`Rol: ${data.role}`);
        console.log(`Nombre Enmascarado: ${maskedName}`);
        console.log(`Email Enmascarado: ${maskedEmail}`);
        console.log(`Ciudad (cityKey): ${data.cityKey}`);
        console.log(`sharedRideAlphaTester actual: ${data.sharedRideAlphaTester !== undefined ? data.sharedRideAlphaTester : 'Campo no existe'}`);
        
        console.log(`\n--- CAMBIO PROPUESTO ---`);
        console.log(`Documento a modificar: users/${targetUid}`);
        console.log(`Operación: db.doc('users/${targetUid}').update({ sharedRideAlphaTester: true })`);

    } catch (e: any) {
        console.error("Error consultando usuario:", e.message);
    }
}

preflightCheck().then(() => process.exit(0)).catch(console.error);
