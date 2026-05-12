
/**
 * VamO Cloud Functions - Entrypoint
 * Structure: Clean bootstrap + Secure Exports
 * No business logic should reside here.
 */

import * as admin from "firebase-admin";

// 1. Initialize Firebase Admin (MUST be first)
admin.initializeApp();

// 2. Export functions from specialized modules
// This pattern prevents circular dependencies and cold-start initialization crashes.

export * from "./handlers";
export * from "./rides";
export * from "./claims";
export * from "./chat";
export * from "./promotions";
export * from "./ensureMunicipalPricing";
export * from "./eligibility";
export * from "./expansion";
export * from "./incentives";
export * from "./wallet_api";
export * from "./welcome";
export * from "./fraud";
export * from "./municipalTreasury";
export * from "./municipalUsers";
export * from "./traffic";
export * from "./municipal";
export * from "./users";
export * from "./documents";
export * from "./publicProfiles";
export * from "./automatedBlocking";
export * from "./expansionIncentives";
export * from "./audit_triggers";
export * from "./passenger_marks";
export * from "./tracking";
export * from "./watchdog";
export { triggerPanicAlertV1, resolvePanicAlertV1 } from "./safety";
export * from "./diagnostics";
export * from "./onboarding";
export * from "./aggregations";
export * from "./alerts";
export * from "./ai";
export * from "./forecasting";


// Note: Ensure all sub-modules use getDb() from ./lib/firebaseAdmin 
// to avoid "default Firebase app does not exist" errors.
