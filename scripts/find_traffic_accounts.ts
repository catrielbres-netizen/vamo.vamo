import admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function run() {
    console.log("🔍 BUSCANDO USUARIOS DE TRÁNSITO Y MUNICIPIO...");
    const allowedRoles = [
        'traffic',
        'traffic_admin',
        'traffic_operator',
        'traffic_municipal',
        'admin_municipal',
        'municipal_admin',
        'operator_municipal',
        'treasury_municipal',
        'auditor_municipal',
        'station_operator',
        'admin',
        'superadmin'
    ];

    const usersSnap = await db.collection('users').get();
    console.log(`Total usuarios en DB: ${usersSnap.size}`);
    
    let found = false;
    usersSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (allowedRoles.includes(data.role) || (data.email && data.email.includes('transito')) || (data.email && data.email.includes('muni'))) {
            console.log(`- Email: ${data.email} | Rol: ${data.role} | Ciudad: ${data.city || data.cityKey || 'No asignada'} | Nombre: ${data.name || 'Sin nombre'}`);
            found = true;
        }
    });

    if (!found) {
        console.log("⚠️ No se encontraron usuarios con roles de tránsito.");
    }
}

run().catch(console.error);
