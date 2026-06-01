const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    try {
        console.log("=== INICIANDO PRUEBA COMPLETA DE FLUJO MERCADO PAGO ===");
        
        const passengerId = "Fp2SoXCwKNPCpyc72ascUUyZvS32"; // pasajero test
        const driverId = "w14d8P9qfRhhbS1Xm72tN8G9TfN2"; // UID del driver de test
        
        // 1. Crear viaje falso terminado
        const rideRef = db.collection('rides').doc();
        const rideId = rideRef.id;
        
        await rideRef.set({
            passengerId,
            driverId,
            paymentMethod: "mercadopago",
            status: "finished",
            pricing: { total: 1500, finalPrice: 1500, dynamicDiscountAmount: 0 },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[+] Viaje falso creado: ${rideId}`);

        // 2. Generar Preferencia
        // We will just invoke the function locally via require or using https call
        const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");
        
        const driverSnap = await db.collection('mp_accounts').doc(driverId).get();
        if (!driverSnap.exists) {
            console.log("No se encontró cuenta MP para el driver test");
            return;
        }
        const token = driverSnap.data().accessToken || driverSnap.data().access_token;
        const mpUserId = driverSnap.data().mpUserId;
        console.log(`[+] Token usado: ${token.substring(0, 10)}... (Test User: ${token.startsWith('TEST-')})`);
        
        const client = new MercadoPagoConfig({ accessToken: token });
        const preferenceClient = new Preference(client);
        
        const pref = await preferenceClient.create({
            body: {
                items: [{ title: "Viaje VamO TEST", id: rideId, quantity: 1, unit_price: 1500 }],
                external_reference: rideId,
                back_urls: { success: `https://vamoapp.online/dashboard/history/${rideId}?payment=success` },
                auto_return: "approved"
            }
        });
        
        console.log(`[+] Preferencia generada: ${pref.id}`);
        console.log(`[+] Checkout URL: ${pref.sandbox_init_point}`);
        
        // Update ride with pref
        await rideRef.update({
            paymentStatus: "pending",
            mpPreferenceId: pref.id,
            mpIsSandbox: true,
            mpCheckoutUrl: pref.sandbox_init_point,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 3. Simular Webhook V5
        // Webhooks receive a payment ID, but we didn't actually pay it. 
        // We can create a fake payment update in firestore directly to simulate the webhook result
        // OR we can just report the setup and wait for the user to manually pay.
        console.log("=== PRUEBA DE PREPARACIÓN EXITOSA ===");
        console.log("Para completar la prueba visual, el usuario debe abrir este enlace y pagar:");
        console.log(pref.sandbox_init_point);
        
    } catch (e) {
        console.error(e);
    }
}

run();
