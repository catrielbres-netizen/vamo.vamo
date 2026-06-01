const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference } = require("mercadopago");

try {
    admin.initializeApp();
} catch (e) {}

const db = admin.firestore();

async function run() {
    const rideId = "9X33zltdayy5F4tbOQA8"; // The ride
    const driverId = "lqJ6fP8HxKerF7f4u0iK41dH2lw2";

    const driverSnap = await db.collection('mp_accounts').doc(driverId).get();
    const mpData = driverSnap.data();
    const token = mpData.accessToken || mpData.access_token;
    
    console.log("Token:", token.substring(0, 10) + "...");

    const client = new MercadoPagoConfig({ accessToken: token });
    const preferenceClient = new Preference(client);

    const preferenceRequest = {
        items: [{
            id: rideId,
            title: `Viaje VamO TEST`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: 1500,
        }],
        payer: {
            email: "test@vamo.com",
        },
        external_reference: rideId,
        metadata: {
            type: "ride_payment"
        },
        marketplace_fee: 100 // VamO commission
    };

    try {
        const response = await preferenceClient.create({ body: preferenceRequest });
        console.log("Success! Preference ID:", response.id);
    } catch (e) {
        console.error("Failed to create preference!");
        if (e.response) {
            console.error(JSON.stringify(e.response, null, 2));
        } else {
            console.error(e.message);
        }
    }
}

run().catch(console.error).finally(() => process.exit());
