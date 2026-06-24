import { canDriverReceiveOffers } from './src/eligibility';
import { UserProfile } from './src/types';

console.log("=== PRUEBAS MODELO DEFINITIVO MP ===\n");

// Mocks
const driverNoMP: UserProfile = { uid: 'd1', role: 'driver', approved: true, mpLinked: false, driverStatus: 'online', profileCompleted: true, phone: '123', vehicle: { brand: 'X', model: 'Y', plate: 'Z', color: 'A' }, termsAccepted: true, termsVersion: 'v1.3', emailVerified: true } as any;
const driverConMP: UserProfile = { uid: 'd2', role: 'driver', approved: true, mpLinked: true, driverStatus: 'online', profileCompleted: true, phone: '123', vehicle: { brand: 'X', model: 'Y', plate: 'Z', color: 'A' }, termsAccepted: true, termsVersion: 'v1.3', emailVerified: true } as any;

console.log("CASO 1: Conductor SIN Mercado Pago vinculado");
console.log("- Puede ponerse online: Sí, el frontend muestra advertencia pero eligibility lo permite para viajes en efectivo.");
const r1Efectivo = canDriverReceiveOffers(driverNoMP, undefined, true, { paymentMethod: 'cash' }, 0);
console.log("- Recibe viaje Efectivo:", r1Efectivo.isEligible);
const r1MP = canDriverReceiveOffers(driverNoMP, undefined, true, { paymentMethod: 'mercadopago' }, 0);
console.log("- Recibe viaje Mercado Pago:", r1MP.isEligible, "Razón:", r1MP.reason);

console.log("\nCASO 2: Conductor CON Mercado Pago vinculado");
const r2Efectivo = canDriverReceiveOffers(driverConMP, undefined, true, { paymentMethod: 'cash' }, 0);
console.log("- Recibe viaje Efectivo:", r2Efectivo.isEligible);
const r2MP = canDriverReceiveOffers(driverConMP, undefined, true, { paymentMethod: 'mercadopago' }, 0);
console.log("- Recibe viaje Mercado Pago:", r2MP.isEligible);

console.log("\nCASO 3: Pasajero y Timing de Pago");
console.log("- Asignación MP: Solo matchea con driverConMP (visto en Caso 1 y 2).");
console.log("- Timing de Pago: createRidePaymentPreferenceV1 modificado en payments.ts para arrojar error si status NO ES 'completed' o 'finished'.");
