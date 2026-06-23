import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

async function runPhase3() {
    console.log("🧪 Iniciando FASE 3: Simulación Mercado Pago Sandbox...");
    const db = admin.firestore();

    const eduardoId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    const eduardoMpToken = 'APP_USR-COMPROMISED';
    
    const paxId = 'sim_pax_fase3_' + Date.now();
    const rideId = 'sim_ride_mp_' + Date.now();
    const totalAmount = 5000;

    // 1. Validar y configurar mp_accounts del conductor Eduardo
    console.log("1. Configurando mp_accounts de Eduardo para Sandbox...");
    await db.doc(`mp_accounts/${eduardoId}`).set({
        status: 'linked',
        mpUserId: 665467758,
        accessToken: eduardoMpToken,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        isTestSimulation: true
    }, { merge: true });

    // 2. Crear pasajero test
    console.log("2. Creando Pasajero Test...");
    await db.doc(`users/${paxId}`).set({
        role: 'passenger',
        cityKey: 'MENDIOLAZA',
        name: 'Buyer Test',
        email: 'test_user_3102929531@testuser.com', // Fake email for sandbox buyer
        activeRideId: rideId,
        isTestSimulation: true
    }, { merge: true });

    // 3. Crear el viaje para pago
    console.log(`3. Creando viaje ${rideId} (Importe: $${totalAmount})...`);
    await db.doc(`rides/${rideId}`).set({
        passengerId: paxId,
        driverId: eduardoId,
        status: 'in_progress', // Debe estar in_progress para generar pago
        cityKey: 'MENDIOLAZA',
        paymentMethod: 'mercadopago',
        pricing: { estimatedTotal: totalAmount },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isTestSimulation: true
    });

    // 4. Intentar crear Preferencia MP (Simulando createRidePaymentPreferenceV1)
    console.log("4. Generando preferencia Mercado Pago Sandbox...");
    
    const commissionPercent = 10;
    const vamoCommissionAmount = Math.round(totalAmount * (commissionPercent / 100));
    
    // Fallback if marketplace_fee is not available (Single driver mode usually ignores it or uses it if authorized)
    // We will attempt WITHOUT marketplace_fee since we don't have OAuth grants for the VamO app directly
    // This perfectly matches "paymentMode = single_driver_no_split"
    const paymentMode = "single_driver_no_split";
    const splitApplied = false;
    const commissionCollectionStatus = "internal_only";
    const marketplaceFeeApplied = 0;
    const driverGrossAmount = totalAmount;

    const preferenceRequest = {
        items: [{
            id: rideId,
            title: `Viaje VamO TEST - ${rideId}`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: totalAmount,
        }],
        payer: { email: 'test_user_3102929531@testuser.com' },
        external_reference: rideId,
        metadata: { ride_id: rideId, type: "ride_payment" },
        auto_return: "approved",
        back_urls: {
            success: "https://studio-6697160840-7c67f.web.app/success",
            failure: "https://studio-6697160840-7c67f.web.app/failure",
            pending: "https://studio-6697160840-7c67f.web.app/pending"
        }
    };

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${eduardoMpToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferenceRequest)
    });

    const prefData = await res.json();
    if (!res.ok) {
        throw new Error(`Fallo creando preferencia MP: ${JSON.stringify(prefData)}`);
    }

    console.log(`✅ Preferencia creada con éxito!`);
    console.log(`   - ID: ${prefData.id}`);
    console.log(`   - Sandbox URL: ${prefData.sandbox_init_point}`);

    // Update ride with preference
    await db.doc(`rides/${rideId}`).update({
        paymentProvider: "mercadopago",
        paymentMode: paymentMode,
        paymentStatus: "pending",
        mpPreferenceId: prefData.id,
        mpIsSandbox: true,
        mpCheckoutUrl: prefData.sandbox_init_point,
        vamoCommissionPercent: commissionPercent,
        vamoCommissionAmount: vamoCommissionAmount,
        driverGrossAmount: driverGrossAmount,
        splitApplied: splitApplied,
        marketplaceFeeApplied: marketplaceFeeApplied,
        commissionCollectionStatus: commissionCollectionStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 5. Simular Webhook (Pago Aprobado)
    console.log("\n5. Simulando Webhook de Pago Aprobado...");
    // En la vida real, el webhook recibe el payment.id y busca la external_reference.
    // Nosotros actualizaremos directamente el ride.
    await db.doc(`rides/${rideId}`).update({
        paymentStatus: 'approved',
        mpPaymentId: 'sim_payment_' + Date.now(),
        mpPaymentStatus: 'approved',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Pago marcado como 'approved' en el viaje.");

    // 6. Liquidación (Comisión interna 6/2/1/1/90)
    console.log("\n6. Simulando Finalización y Liquidación del viaje...");
    
    // Liquidación exacta VamO PRO
    const vamoAmount = Math.round(totalAmount * 0.06);
    const municipalAmount = Math.round(totalAmount * 0.02);
    const taxiAssociationAmount = Math.round(totalAmount * 0.01);
    const remisAssociationAmount = Math.round(totalAmount * 0.01);
    const totalAssociationsAmount = taxiAssociationAmount + remisAssociationAmount;
    const driverEarnings = totalAmount - vamoCommissionAmount; // 4500

    const completedRideData = {
        totalAmount: totalAmount,
        commissionAmount: vamoCommissionAmount, // 10%
        vamoAmount, // 6%
        municipalAmount, // 2%
        taxiAssociationAmount, // 1%
        remisAssociationAmount, // 1%
        totalAssociationsAmount, // 2%
        driverEarnings,
        totalFare: totalAmount,
        commissionRate: 0.10,
        driverNetAmount: driverEarnings,
        calculatedAt: admin.firestore.Timestamp.now()
    };

    await db.doc(`rides/${rideId}`).update({
        status: 'completed',
        completedRide: completedRideData,
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
        isSimulationResult: true
    });

    console.log("✅ Viaje completado y liquidado internamente.");
    console.log(`   - Driver Neto: $${driverEarnings}`);
    console.log(`   - Comisión Total: $${vamoCommissionAmount}`);
    console.log(`   - VamO (6%): $${vamoAmount}`);
    console.log(`   - Muni (2%): $${municipalAmount}`);
    console.log(`   - Taxis (1%): $${taxiAssociationAmount}`);
    console.log(`   - Remises (1%): $${remisAssociationAmount}`);

    // Clean up active rides
    await db.doc(`users/${eduardoId}`).update({ activeRideId: null, driverStatus: 'online' });
    await db.doc(`users/${paxId}`).update({ activeRideId: null });

    console.log("\n🧪 FASE 3 Completada con Éxito.");
    process.exit(0);
}

runPhase3().catch(console.error);
