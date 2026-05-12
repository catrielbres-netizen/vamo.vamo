import * as admin from "firebase-admin";
import { getFunctions as getAdminFunctions } from "firebase-admin/functions";

/**
 * [VamO PRO] Centralized Firebase Admin Access
 */

function ensureInitialized() {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
}

export const getDb = () => { ensureInitialized(); return admin.firestore(); };
export const getAuth = () => { ensureInitialized(); return admin.auth(); };
export const getMessaging = () => { ensureInitialized(); return admin.messaging(); };
export const getFunctions = () => { ensureInitialized(); return getAdminFunctions(); };

// Shortcut for the most common use case
export const db = () => admin.firestore();
