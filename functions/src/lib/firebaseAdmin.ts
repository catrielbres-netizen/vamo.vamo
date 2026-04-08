import * as admin from "firebase-admin";
import { getFunctions as getAdminFunctions } from "firebase-admin/functions";

/**
 * [VamO PRO] Centralized Firebase Admin Access
 * This module ensures we only call admin.firestore() after initialization.
 * Using getters avoids module-level initialization crashes (app/no-app error).
 */

export const getDb = () => admin.firestore();
export const getAuth = () => admin.auth();
export const getMessaging = () => admin.messaging();
export const getFunctions = () => getAdminFunctions();

// Shortcut for the most common use case
export const db = () => admin.firestore();
