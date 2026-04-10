
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
// Note: Ensure all sub-modules use getDb() from ./lib/firebaseAdmin 
// to avoid "default Firebase app does not exist" errors.
