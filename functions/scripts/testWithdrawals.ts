import * as admin from 'firebase-admin';
// Import removed to prevent eager execution of admin.firestore()
import * as path from 'path';

// Provide absolute path to service account
const serviceAccount = require(path.resolve(__dirname, '../../service-account.json'));

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const fft = require('firebase-functions-test')();
const handlers = require('../src/handlers');

const requestWithdrawal = fft.wrap(handlers.requestWithdrawalV1);
const processWithdrawal = fft.wrap(handlers.processWithdrawalByAdminV1);

async function main() {
    console.log("--- TEST RETIROS MANUALES ---");
    const testDriverId = 'test_withdrawal_driver_1';
    const testAdminId = 'test_admin_1';

    console.log("1. Creando conductor temporal y admin...");
    await db.doc(`users/${testDriverId}`).set({
        role: 'driver',
        cityKey: 'rio_gallegos',
        firstName: 'Test',
        lastName: 'Driver',
        name: 'Test Driver',
        currentBalance: 20000,
        nonWithdrawableBalance: 0
    });

    await db.doc(`users/${testAdminId}`).set({
        role: 'admin',
        cityKey: 'rio_gallegos',
        permissions: { financial: true }
    });

    await db.doc(`wallets/${testDriverId}`).set({
        cashBalance: 20000,
        currency: 'ARS',
        totalBalance: 20000
    });

    console.log("2. Probando primera solicitud normal (5000)...");
    
    // Mock the request object
    let req1 = {
        data: { amount: 5000, bankInfo: { cbuOrAlias: 'TEST.ALIAS.1', accountHolder: 'Test Driver' } },
        auth: { uid: testDriverId }
    } as any;

    let res1 = await requestWithdrawal(req1);
    console.log("Resultado Solicitud 1:", res1);

    // Verify pending status
    const req1Doc = await db.doc(`withdrawal_requests/${res1.requestId}`).get();
    console.log("Estado de Solicitud 1:", req1Doc.data()?.status);

    console.log("3. Probando doble retiro (intento de 20000)...");
    let req2 = {
        data: { amount: 20000, bankInfo: { cbuOrAlias: 'TEST.ALIAS.1', accountHolder: 'Test Driver' } },
        auth: { uid: testDriverId }
    } as any;

    try {
        await requestWithdrawal(req2);
        console.log("ERROR: Se permitió doble retiro!");
    } catch (e: any) {
        console.log("ÉXITO: Se bloqueó doble retiro con mensaje:", e.message);
    }

    console.log("4. Probando segunda solicitud válida (10000)...");
    let req3 = {
        data: { amount: 10000, bankInfo: { cbuOrAlias: 'TEST.ALIAS.1', accountHolder: 'Test Driver' } },
        auth: { uid: testDriverId }
    } as any;

    let res3 = await requestWithdrawal(req3);
    console.log("Resultado Solicitud 3:", res3);

    console.log("5. Probar aprobación sin comprobante...");
    let approveFailReq = {
        data: { requestId: res1.requestId, action: 'approve' }, // missing details
        auth: { uid: testAdminId }
    } as any;

    try {
        await processWithdrawal(approveFailReq);
        console.log("ERROR: Se permitió aprobación sin datos!");
    } catch (e: any) {
        console.log("ÉXITO: Se bloqueó aprobación incompleta con mensaje:", e.message);
    }

    console.log("6. Probar aprobación correcta de Solicitud 1...");
    let approveOkReq = {
        data: { 
            requestId: res1.requestId, 
            action: 'approve',
            paymentMethod: 'mercado_pago',
            transferReceiptNumber: 'MOCK-12345',
            destinationAliasOrCvu: 'TEST.ALIAS.1',
            adminNote: 'Aprobado en test'
        },
        auth: { uid: testAdminId }
    } as any;

    let approveRes = await processWithdrawal(approveOkReq);
    console.log("Resultado Aprobación:", approveRes);

    const checkApprove = await db.doc(`withdrawal_requests/${res1.requestId}`).get();
    console.log("Estado final Solicitud 1:", checkApprove.data()?.status);

    console.log("7. Probar rechazo de Solicitud 3...");
    let rejectReq = {
        data: {
            requestId: res3.requestId,
            action: 'reject',
            adminNote: 'CBU incorrecto'
        },
        auth: { uid: testAdminId }
    } as any;

    let rejectRes = await processWithdrawal(rejectReq);
    console.log("Resultado Rechazo:", rejectRes);

    const checkReject = await db.doc(`withdrawal_requests/${res3.requestId}`).get();
    console.log("Estado final Solicitud 3:", checkReject.data()?.status);

    console.log("9. Limpiando datos de prueba...");
    await db.doc(`users/${testDriverId}`).delete();
    await db.doc(`users/${testAdminId}`).delete();
    await db.doc(`wallets/${testDriverId}`).delete();
    await db.doc(`withdrawal_requests/${res1.requestId}`).delete();
    await db.doc(`withdrawal_requests/${res3.requestId}`).delete();

    console.log("--- TEST COMPLETADO ---");
    process.exit(0);
}

main().catch(console.error);
