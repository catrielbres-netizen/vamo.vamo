import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, MunicipalProfile } from "./types";

/**
 * [VamO PRO] Public Profile Sync
 * Automatically keeps public_driver_profiles in sync with users and municipal_profiles.
 */
export const syncPublicProfileOnUserUpdate = onDocumentWritten("users/{driverId}", async (event) => {
    const driverId = event.params.driverId;
    const db = getDb();

    try {
        const userSnap = await db.doc(`users/${driverId}`).get();
        if (!userSnap.exists) {
            // If user is deleted, we might want to delete public profile too
            await db.doc(`public_driver_profiles/${driverId}`).delete();
            return;
        }

        const userData = userSnap.data() as UserProfile;
        if (userData.role !== 'driver') return;

        const muniSnap = await db.doc(`municipal_profiles/${driverId}`).get();
        const muniData = muniSnap.exists ? (muniSnap.data() as MunicipalProfile) : null;

        const publicProfile = {
            displayName: userData.name || 'Conductor VamO',
            photoURL: userData.photoURL || '',
            cityKey: userData.cityKey || muniData?.cityKey || '',
            city: userData.city || muniData?.city || '',
            driverSubtype: userData.driverSubtype || 'EXPRESS',
            municipalStatus: userData.municipalStatus || muniData?.municipalStatus || 'pending',
            vehicleBrand: userData.vehicleBrand || '',
            vehicleModel: userData.vehicleModel || '',
            vehicleYear: userData.carModelYear || '',
            licensePlate: userData.plateNumber || '',
            vehiclePhotoFrontUrl: (userData as any).vehiclePhotoFrontUrl || '',
            municipalCode: userData.municipalCode || muniData?.municipalCode || '',
            updatedAt: FieldValue.serverTimestamp(),
            licenseExpiry: muniData?.licenseExpiry || null,
            insuranceExpiry: muniData?.insuranceExpiry || null,
            itvExpiry: muniData?.itvExpiry || null,
        };

        await db.doc(`public_driver_profiles/${driverId}`).set(publicProfile, { merge: true });
        logger.info(`[SYNC_PUBLIC] Profile for ${driverId} synced via Cloud Function.`);
    } catch (error) {
        logger.error(`[SYNC_PUBLIC_ERROR] Error syncing profile for ${driverId}:`, error);
    }
});

/**
 * Also sync when municipal profile changes (e.g. status change)
 */
export const syncPublicProfileOnMuniUpdate = onDocumentWritten("municipal_profiles/{driverId}", async (event) => {
    const driverId = event.params.driverId;
    const db = getDb();

    try {
        const muniSnap = await db.doc(`municipal_profiles/${driverId}`).get();
        if (!muniSnap.exists) return;

        const userSnap = await db.doc(`users/${driverId}`).get();
        if (!userSnap.exists) return;

        const userData = userSnap.data() as UserProfile;
        const muniData = muniSnap.data() as MunicipalProfile;

        const publicProfile = {
            displayName: userData.name || 'Conductor VamO',
            photoURL: userData.photoURL || '',
            cityKey: userData.cityKey || muniData?.cityKey || '',
            city: userData.city || muniData?.city || '',
            driverSubtype: userData.driverSubtype || 'EXPRESS',
            municipalStatus: userData.municipalStatus || muniData?.municipalStatus || 'pending',
            vehicleBrand: userData.vehicleBrand || '',
            vehicleModel: userData.vehicleModel || '',
            vehicleYear: userData.carModelYear || '',
            licensePlate: userData.plateNumber || '',
            vehiclePhotoFrontUrl: (userData as any).vehiclePhotoFrontUrl || '',
            municipalCode: userData.municipalCode || muniData?.municipalCode || '',
            updatedAt: FieldValue.serverTimestamp(),
            licenseExpiry: muniData?.licenseExpiry || null,
            insuranceExpiry: muniData?.insuranceExpiry || null,
            itvExpiry: muniData?.itvExpiry || null,
        };

        await db.doc(`public_driver_profiles/${driverId}`).set(publicProfile, { merge: true });
        logger.info(`[SYNC_PUBLIC] Profile for ${driverId} synced via Muni Cloud Function.`);
    } catch (error) {
        logger.error(`[SYNC_PUBLIC_ERROR] Error syncing profile for ${driverId}:`, error);
    }
});
