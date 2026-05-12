import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, Role } from "./types";
import { logMunicipalAction } from "./lib/audit";

/**
 * [VamO MUNI] Create a new internal municipal user.
 * Restricted to admin or admin_municipal (of same city).
 */
export const createMunicipalUserV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { email, password, name, role, cityKey } = request.data;
    const uid = request.auth.uid;

    // 1. Auth & Permission Check
    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;

    const isGlobalAdmin = caller.role === 'admin';
    const isLocalAdmin = caller.role === 'admin_municipal' && caller.cityKey === cityKey;

    if (!isGlobalAdmin && !isLocalAdmin) {
        throw new HttpsError('permission-denied', 'No tienes permiso para crear usuarios en esta ciudad.');
    }

    // 2. Validate Inputs
    const validRoles: Role[] = ["admin_municipal", "operator_municipal", "treasury_municipal", "auditor_municipal"];
    if (!validRoles.includes(role)) {
        throw new HttpsError('invalid-argument', 'Rol municipal no válido.');
    }

    try {
        // 3. Create Firebase Auth User
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        // 4. Create User Profile
        const newUserProfile: UserProfile = {
            uid: userRecord.uid,
            email,
            name,
            role,
            cityKey,
            createdAt: FieldValue.serverTimestamp() as any,
            approved: true,
            emailVerified: true,
            profileCompleted: true
        };

        await db.doc(`users/${userRecord.uid}`).set(newUserProfile);

        // 5. Audit Log
        await logMunicipalAction({
            cityKey,
            actorUid: uid,
            actorName: caller.name || 'Admin',
            actorEmail: caller.email || '',
            actorRole: caller.role,
            action: "user_created",
            targetType: "user",
            targetId: userRecord.uid,
            metadata: { email, role }
        });

        return { success: true, uid: userRecord.uid };
    } catch (error: any) {
        logger.error(`[MUNI_USERS] Error creating user:`, error);
        throw new HttpsError('internal', error.message || 'Error al crear el usuario municipal.');
    }
});

/**
 * [VamO MUNI] Update an internal municipal user (Role or Status).
 */
export const updateMunicipalUserV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { targetUid, role, status } = request.data;
    const uid = request.auth.uid;

    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;

    const targetSnap = await db.doc(`users/${targetUid}`).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
    const target = targetSnap.data() as UserProfile;

    const cityKey = target.cityKey;

    const isGlobalAdmin = caller.role === 'admin';
    const isLocalAdmin = caller.role === 'admin_municipal' && caller.cityKey === cityKey;

    if (!isGlobalAdmin && !isLocalAdmin) {
        throw new HttpsError('permission-denied', 'No autorizado.');
    }

    const updates: any = {};
    if (role) {
        const validRoles: Role[] = ["admin_municipal", "operator_municipal", "treasury_municipal", "auditor_municipal"];
        if (!validRoles.includes(role)) throw new HttpsError('invalid-argument', 'Rol no válido.');
        updates.role = role;
    }
    if (status) {
        updates.status = status;
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    await db.doc(`users/${targetUid}`).update(updates);

    // Audit Log
    await logMunicipalAction({
        cityKey: cityKey || 'unknown',
        actorUid: uid,
        actorName: caller.name || 'Admin',
        actorEmail: caller.email || '',
        actorRole: caller.role,
        action: "user_updated",
        targetType: "user",
        targetId: targetUid,
        metadata: updates
    });

    return { success: true };
});
