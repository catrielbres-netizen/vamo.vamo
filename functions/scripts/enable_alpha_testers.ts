import * as admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

async function main() {
    const targetUids = new Set([
        'HYakOQJ8WqeauOHtn8VdcYlaSlK2', // Eduardo Pasajero Test 1 (posiblemente anterior)
        'eMhDWqwmQMgoKMskjzTd2StwQaI3', // Maria
        'VNhou0ag4wXXPr6IXa3foO6SI8B3'  // Eduardo Conductor
    ]);

    // Find the new user by email
    const emailToFind = 'autorcompositoreducisneros@gmail.com';
    const emailSnap = await db.collection('users').where('email', '==', emailToFind).get();
    if (!emailSnap.empty) {
        emailSnap.forEach(doc => {
            targetUids.add(doc.id);
        });
    }

    console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  AUDITORÍA Y HABILITACIÓN DE ALPHA TESTERS`);
    console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

    for (const uid of Array.from(targetUids)) {
        const uSnap = await db.collection('users').doc(uid).get();
        if (!uSnap.exists) {
            console.log(`❌ Usuario ${uid} no existe en la DB.`);
            continue;
        }

        const u: any = uSnap.data();
        console.log(`👤 USUARIO: ${u.firstName} ${u.lastName} (${u.email || u.phoneNumber}) | UID: ${uid}`);
        console.log(`   Rol: ${u.role}`);
        console.log(`   Flags actuales:`);
        console.log(`     - sharedRideAlphaTester: ${u.sharedRideAlphaTester ?? 'undefined'}`);

        // Update to true
        await db.collection('users').doc(uid).update({
            sharedRideAlphaTester: true
        });

        console.log(`   ✅ Flags corregidos: sharedRideAlphaTester = true`);

        if (u.role === 'driver') {
            console.log(`   🚗 DIAGNÓSTICO DEL CONDUCTOR:`);
            console.log(`     - driverStatus: ${u.driverStatus}`);
            console.log(`     - isAvailable: ${u.isAvailable}`);
            console.log(`     - cityKey: ${u.cityKey}`);
            console.log(`     - canReceiveRides: ${u.canReceiveRides}`);
            console.log(`     - approved: ${u.approved}`);
            console.log(`     - enabled: ${u.enabled}`);
            console.log(`     - vehicle status: ${u.vehicle ? 'present' : 'missing'}`);
            
            // Check drivers_locations
            const dlSnap = await db.collection('drivers_locations').doc(uid).get();
            if (dlSnap.exists) {
                const dl: any = dlSnap.data();
                console.log(`     [drivers_locations]: status=${dl.status}, isAvailable=${dl.isAvailable}, activeRideId=${dl.activeRideId || null}`);
            } else {
                console.log(`     [drivers_locations]: NO EXISTE`);
            }
        }
        console.log('--------------------------------------------------------------------------------');
    }
}

main().catch(console.error);
