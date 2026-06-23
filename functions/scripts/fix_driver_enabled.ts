import * as admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

async function main() {
    const driverUid = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    
    console.log(`Fijando campos habilitantes para el conductor...`);
    await db.collection('users').doc(driverUid).update({
        enabled: true,
        canReceiveRides: true,
        approved: true
    });
    console.log(`✅ Conductor habilitado.`);
}

main().catch(console.error);
