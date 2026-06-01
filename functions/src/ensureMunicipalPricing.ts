import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
    // Attempt to migrate from legacy cities collection
    const citySnap = await db.doc(`cities/${pricingMunicipalityKey}`).get();
    let legacyPricing = citySnap.exists ? citySnap.data()?.pricing : null;

    const defaultPricing: PricingConfig & { dynamicPricing: any } = {
      version: 1,
      DAY_BASE_FARE: legacyPricing?.DAY_BASE_FARE ?? 1400,
      DAY_PRICE_PER_100M: legacyPricing?.DAY_PRICE_PER_100M ?? 152,
      DAY_WAITING_PER_MIN: legacyPricing?.DAY_WAITING_PER_MIN ?? 220,
      NIGHT_BASE_FARE: legacyPricing?.NIGHT_BASE_FARE ?? 1652,
      NIGHT_PRICE_PER_100M: legacyPricing?.NIGHT_PRICE_PER_100M ?? 189,
      NIGHT_WAITING_PER_MIN: legacyPricing?.NIGHT_WAITING_PER_MIN ?? 277,
      MINIMUM_FARE: legacyPricing?.MINIMUM_FARE ?? 1500,
      PLATFORM_COMMISSION_RATE: legacyPricing?.PLATFORM_COMMISSION_RATE ?? 200,
      commission_particular: legacyPricing?.commission_particular ?? 0.13,
      commission_taxi_remis: legacyPricing?.commission_taxi_remis ?? 0.07,
      municipal_percentage: legacyPricing?.municipal_percentage ?? 0.02,
      ASSISTANCE_FEE: legacyPricing?.ASSISTANCE_FEE ?? 400,
      assistanceEnabled: legacyPricing?.assistanceEnabled ?? true,
      dynamicPricing: {
        enabled: false,
        algorithmMode: "manual",
        currentDiscountPercent: 0,
        maxDiscountPercent: 30,
        minDiscountPercent: 0,
        reasonCodes: [],
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system_init"
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    await docRef.set(defaultPricing, { merge: true });
    return { success: true, created: true, migrated: !!legacyPricing, pricingMunicipalityKey };
  }

  // If it exists but lacks dynamicPricing, initialize it
  if (!snap.data()?.dynamicPricing) {
    await docRef.update({
      dynamicPricing: {
        enabled: false,
        algorithmMode: "manual",
        currentDiscountPercent: 0,
        maxDiscountPercent: 30,
        minDiscountPercent: 0,
        reasonCodes: [],
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system_init"
      }
    });
    return { success: true, updated: true, pricingMunicipalityKey };
  }

  return { success: true, created: false, pricingMunicipalityKey };
});
