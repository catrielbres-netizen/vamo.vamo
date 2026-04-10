import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getDb } from "./lib/firebaseAdmin";
import { PricingConfig } from "./types";

/**
 * Callable that ensures a municipal pricing document exists.
 * If the document does not exist, it creates it with default fixed tariff values.
 */
export const ensureMunicipalPricingV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const { pricingMunicipalityKey }: { pricingMunicipalityKey: string } = request.data;
  if (!pricingMunicipalityKey) throw new HttpsError('invalid-argument', 'pricingMunicipalityKey es requerido');

  const db = getDb();
  const docRef = db.doc(`municipal_pricing/${pricingMunicipalityKey}`);
  const snap = await docRef.get();

  if (!snap.exists) {
    const defaultPricing: Partial<PricingConfig> = {
      DAY_BASE_FARE: 300,
      DAY_PRICE_PER_100M: 110,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    } as any;
    await docRef.set(defaultPricing, { merge: true });
    return { success: true, created: true, pricingMunicipalityKey };
  }

  return { success: true, created: false, pricingMunicipalityKey };
});
