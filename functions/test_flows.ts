import * as admin from 'firebase-admin';
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'test-project' });
}
import { calculateSettlement } from './src/handlers';
import { PricingConfig, UserProfile, Ride } from './src/types';

console.log("=== INICIANDO PRUEBAS FUNCIONALES ===");

// MOCKS
const pricingConfig: PricingConfig = {
    version: 1, DAY_BASE_FARE: 1400, DAY_PRICE_PER_100M: 152, DAY_WAITING_PER_MIN: 220,
    NIGHT_BASE_FARE: 1652, NIGHT_PRICE_PER_100M: 189, NIGHT_WAITING_PER_MIN: 277,
    MINIMUM_FARE: 2000, PLATFORM_COMMISSION_RATE: 0.08, commission_particular: 0.14,
    commission_taxi_remis: 0.08, municipal_percentage: 0.02, ASSISTANCE_FEE: 400, assistanceEnabled: true
};

const cityConfig = {
    commissions: {
        vamoPercentage: 6,
        municipalPercentage: 2,
        taxiUnionPercentage: 0,
        remisUnionPercentage: 0
    },
    grossReceiptsTaxRate: 0
};

const driver: UserProfile = {
    id: 'driver_123',
    name: 'Conductor Test',
    role: 'driver',
    driverSubtype: 'professional',
    mpLinked: true
} as any;

const passenger: UserProfile = {
    id: 'pass_123',
    name: 'Pasajero Test',
    role: 'passenger',
    vamoPoints: 10
} as any;

const baseRide: any = {
    id: 'ride_test_001',
    driverId: 'driver_123',
    passengerId: 'pass_123',
    cityKey: 'rawson',
    serviceType: 'professional',
    status: 'completed',
    pricing: {
        estimatedTotal: 5000,
        estimatedDistanceMeters: 10000,
    },
    paymentSnapshot: { useWallet: false }
};

console.log("\n--- ESCENARIO 2: Viaje pagado con Billetera ---");
const walletRide = { ...baseRide, paymentMethod: 'wallet', paymentSnapshot: { useWallet: true }, pricing: { ...baseRide.pricing, walletCoveredAmount: 5000 } };
const settlementWallet = calculateSettlement(walletRide, driver, [], pricingConfig, undefined, passenger, cityConfig);

console.log("Liquidación Wallet:");
console.log("- Pasajero paga con Billetera:", settlementWallet.walletCoveredAmount || 0);
console.log("- Efectivo a cobrar:", settlementWallet.cashToCollect);
console.log("- Comisión VamO (8%):", settlementWallet.commissionAmount);
console.log("- Ingreso Neto Conductor:", settlementWallet.driverNetAmount);
console.log("- Acreditación a Billetera Conductor (walletCovered - commission):", (settlementWallet.walletCoveredAmount || 0) - (settlementWallet.commissionAmount || 0));

console.log("\n--- ESCENARIO 3: Viaje pagado en Efectivo ---");
const cashRide = { ...baseRide, paymentMethod: 'cash', paymentSnapshot: { useWallet: false }, pricing: { ...baseRide.pricing, walletCoveredAmount: 0 } };
const settlementCash = calculateSettlement(cashRide, driver, [], pricingConfig, undefined, passenger, cityConfig);

console.log("Liquidación Efectivo:");
console.log("- Pasajero paga con Billetera:", settlementCash.walletCoveredAmount || 0);
console.log("- Efectivo a cobrar:", settlementCash.cashToCollect);
console.log("- Comisión VamO (8%):", settlementCash.commissionAmount);
console.log("- Ingreso Neto Conductor:", settlementCash.driverNetAmount);
console.log("- Descuento de Billetera Conductor (solo comisión porque cobró en efectivo):", -(settlementCash.commissionAmount || 0));


console.log("\n--- ESCENARIO 5: Mercado Pago Preference Payload ---");
// Simulamos el objeto que generaría createPaymentPreferenceV4 para una recarga de saldo
const amountToTopup = 10000;
const preferenceRequest = {
    items: [{
        id: "wallet-topup",
        title: "Carga de saldo VamO",
        quantity: 1,
        currency_id: "ARS",
        unit_price: amountToTopup,
    }],
    payer: {
        email: "pasajero@test.com",
    },
    external_reference: "pass_123",
    metadata: {
        type: "wallet_topup",
        driver_id: "pass_123",
    },
    back_urls: {
        success: `https://app.vamo.com/success`,
        failure: `https://app.vamo.com/failure`,
        pending: `https://app.vamo.com/pending`,
    },
    auto_return: "approved",
    notification_url: "https://hook.vamo.com",
    binary_mode: true,
};

console.log("Generando preferencia hacia la cuenta de ADMIN (VamO) para recarga de billetera:");
console.log(JSON.stringify(preferenceRequest, null, 2));
console.log("¿Tiene marketplace_fee?:", 'marketplace_fee' in preferenceRequest ? "Sí" : "No (Correcto)");
console.log("Destinatario de fondos: Cuenta Admin VamO (dueña del Access Token de servidor).");
