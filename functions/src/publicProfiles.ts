import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, MunicipalProfile } from "./types";

function calculateOperationalStatus(userData: any, muniData: any) {
    const isSuspended =
        userData.isSuspended === true ||
        userData.trafficSuspended === true ||
        userData.municipalSuspended === true ||
        userData.adminSuspended === true;
    const source = userData.suspensionSource || null;
    const municipalStatus = userData.municipalStatus || muniData?.municipalStatus || 'pending';
    const approved = userData.approved === true;

    let operationalStatus = "active";
    let operationalStatusLabel = "Activo para operar";

    if (isSuspended) {
        if (userData.trafficSuspended === true || source === 'traffic') {
            operationalStatus = "suspended_by_traffic";
            operationalStatusLabel = "Bloqueado operativamente por Tránsito";
        } else if (userData.municipalSuspended === true || source === 'municipal') {
            operationalStatus = "suspended_by_municipality";
            operationalStatusLabel = "Suspendido por Municipalidad";
        } else if (userData.adminSuspended === true || source === 'admin') {
            operationalStatus = "suspended_by_admin";
            operationalStatusLabel = "Suspendido por Administración VamO";
        } else {
            operationalStatus = "suspended";
            operationalStatusLabel = "Suspendido";
        }
    } else if (municipalStatus !== 'active') {
        operationalStatus = "pending_municipal_review";
        operationalStatusLabel = "Habilitación Municipal Pendiente";
    } else if (!approved) {
        operationalStatus = "not_approved";
        operationalStatusLabel = "Pendiente de Aprobación Final";
    }

    // credentialStatus: "valid" | "blocked" | "pending" | "expired" | "rejected"
    let credentialStatus = "valid";
    if (isSuspended) {
        credentialStatus = "blocked";
    } else if (municipalStatus === 'rejected_by_municipality') {
        credentialStatus = "rejected";
    } else if (municipalStatus === 'suspended_expired_license' || municipalStatus === 'suspended_expired_insurance') {
        credentialStatus = "expired";
    } else if (municipalStatus !== 'active' || !approved) {
        credentialStatus = "pending";
    }

    return {
        operationalStatus,
        operationalStatusLabel,
        credentialStatus
    };
}

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

        const opStatus = calculateOperationalStatus(userData, muniData);

        const publicProfile = {
            displayName: userData.name || 'Conductor VamO',
            photoURL: userData.photoURL || '',
            cityKey: userData.cityKey || muniData?.cityKey || '',
            city: userData.city || muniData?.city || '',
            driverSubtype: userData.driverSubtype || 'EXPRESS',
            municipalStatus: userData.municipalStatus || muniData?.municipalStatus || 'pending',
            approved: userData.approved === true,
            isSuspended:
                userData.isSuspended === true ||
                userData.trafficSuspended === true ||
                userData.municipalSuspended === true ||
                userData.adminSuspended === true,
            trafficSuspended: userData.trafficSuspended === true,
            municipalSuspended: userData.municipalSuspended === true,
            adminSuspended: userData.adminSuspended === true,
            suspensionSource: userData.suspensionSource || null,
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
            driverGenderPublicSafe: userData.gender || (userData as any).driverGender || 'not_specified',
            ...opStatus
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

        const opStatus = calculateOperationalStatus(userData, muniData);

        const publicProfile = {
            displayName: userData.name || 'Conductor VamO',
            photoURL: userData.photoURL || '',
            cityKey: userData.cityKey || muniData?.cityKey || '',
            city: userData.city || muniData?.city || '',
            driverSubtype: userData.driverSubtype || 'EXPRESS',
            municipalStatus: userData.municipalStatus || muniData?.municipalStatus || 'pending',
            approved: userData.approved === true,
            isSuspended:
                userData.isSuspended === true ||
                userData.trafficSuspended === true ||
                userData.municipalSuspended === true ||
                userData.adminSuspended === true,
            trafficSuspended: userData.trafficSuspended === true,
            municipalSuspended: userData.municipalSuspended === true,
            adminSuspended: userData.adminSuspended === true,
            suspensionSource: userData.suspensionSource || null,
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
            driverGenderPublicSafe: userData.gender || (userData as any).driverGender || 'not_specified',
            ...opStatus
        };

        await db.doc(`public_driver_profiles/${driverId}`).set(publicProfile, { merge: true });
        logger.info(`[SYNC_PUBLIC] Profile for ${driverId} synced via Muni Cloud Function.`);
    } catch (error) {
        logger.error(`[SYNC_PUBLIC_ERROR] Error syncing profile for ${driverId}:`, error);
    }
});
