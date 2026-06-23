import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";

/**
 * Normalizador de strings para búsquedas resilientes
 */
const normalize = (str: string) => str?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '') || '';

/**
 * INVITE MUNICIPALITY V1
 * Crea una invitación formal con un token que expira.
 */
export const inviteMunicipalityV1 = functions.https.onCall(async (data: any, context) => {
    const db = admin.firestore();

    const { cityKey, name, province, adminEmail } = data;
    if (!cityKey || !name || !adminEmail) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan campos obligatorios.");
    }

    const token = uuidv4();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); 

    const inviteId = `${cityKey}_${Date.now()}`;
    const inviteRef = db.collection("municipal_onboarding_invites").doc(inviteId);
    
    const baseUrl = process.env.VAMO_BASE_URL || 'https://studio-6697160840-7c67f.web.app';
    const onboardingUrl = `${baseUrl}/municipal/onboarding?cityKey=${cityKey}&token=${token}`;

    await inviteRef.set({
        cityKey,
        cityName: name,
        municipalityEmail: adminEmail,
        invitedBy: context.auth?.uid || 'system',
        invitedAt: FieldValue.serverTimestamp(),
        status: 'sent',
        token,
        onboardingUrl,
        expiresAt,
    });

    const cityRef = db.collection("cities").doc(cityKey);
    await cityRef.set({
        cityKey,
        name,
        province: province || '',
        country: 'Argentina',
        status: 'invited',
        invitedAt: FieldValue.serverTimestamp(),
        invitedBy: context.auth?.uid || 'system',
        adminEmail,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        config: {
            pricingModel: 'standard',
            fapEnabled: true,
            broadcastEnabled: true
        },
        enabled: true,
        rewardsConfig: {
            basePoolAmount: 2000,
            weeklyPoolAmount: 2000,
            minPointsToQualify: 20,
            totalWeeklyPoints: 0,
            qualifiedDriversCount: 0,
            updatedAt: FieldValue.serverTimestamp()
        }
    }, { merge: true });

    return { success: true, onboardingLink: onboardingUrl };
});

/**
 * CREATE EXPANSION CITY V1
 * Crea directamente una ciudad en el Expansión Hub.
 */
export const createExpansionCityV1 = functions.https.onCall(async (data: any, context) => {
    // 1. Validar usuario autenticado
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión para crear una ciudad.");
    }

    const db = admin.firestore();

    // 2. Validar que sea admin o superadmin
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    const userData = userSnap.data();
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
        throw new functions.https.HttpsError("permission-denied", "Solo administradores pueden crear ciudades.");
    }

    // 3. Recibir parámetros
    const { name, province, country = 'Argentina', targetApprovedDrivers = 50, estimatedLaunchDate } = data;
    if (!name || !province) {
        throw new functions.https.HttpsError("invalid-argument", "El nombre de la ciudad y provincia son requeridos.");
    }

    if (targetApprovedDrivers < 1) {
        throw new functions.https.HttpsError("invalid-argument", "La meta de conductores debe ser al menos 1.");
    }

    // 4. Generar cityKey automáticamente
    // Normalizar: minúsculas, sin tildes, espacios a guion bajo, sin caracteres raros, sin doble guion bajo
    let cityKey = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // sin tildes
        .replace(/[^a-z0-9\s-]/g, "") // mantener solo letras, números, espacios y guiones
        .trim()
        .replace(/[\s-]+/g, "_"); // espacios y guiones a guion bajo

    if (!cityKey) {
        throw new functions.https.HttpsError("invalid-argument", "No se pudo generar un identificador válido para la ciudad.");
    }

    // 5. Validar que cities/{cityKey} no exista
    const cityRef = db.collection("cities").doc(cityKey);
    const citySnap = await cityRef.get();
    if (citySnap.exists) {
        throw new functions.https.HttpsError("already-exists", `La ciudad ya existe (cityKey: ${cityKey}).`);
    }

    const pricingRef = db.collection("municipal_pricing").doc(cityKey);

    // 6. Configurar batch
    const batch = db.batch();

    const now = FieldValue.serverTimestamp();

    // 7. Crear cities/{cityKey}
    batch.set(cityRef, {
        cityKey,
        name,
        province,
        country,
        enabled: true,
        operationalStatus: "recruiting_drivers",
        driverRecruitment: {
            enabled: true,
            targetApprovedDrivers: Number(targetApprovedDrivers),
            registeredDriversCount: 0,
            pendingDriversCount: 0,
            approvedDriversCount: 0,
            rejectedDriversCount: 0,
            enabledDriversCount: 0,
            readyForPassengerMarketing: false,
            estimatedLaunchDate: estimatedLaunchDate || null,
            readyNotifiedAt: null
        },
        passengerAccess: {
            enabled: false,
            marketingEnabled: false
        },
        createdFromExpansionHub: true,
        createdBy: context.auth.uid,
        createdAt: now,
        updatedAt: now
    });

    // 8. Crear municipal_pricing/{cityKey}
    batch.set(pricingRef, {
        cityKey,
        cityName: name,
        province,
        country,
        enabled: true,
        pricingEnabled: false,
        commissionEnabled: false,
        createdFromExpansionHub: true,
        createdBy: context.auth.uid,
        createdAt: now,
        updatedAt: now
    });

    // 9. Ejecutar batch (atómico)
    await batch.commit();

    // 10. Devolver respuesta
    return {
        success: true,
        cityKey,
        cityName: name
    };
});

/**
 * UPDATE EXPANSION CITY V1
 * Permite a los administradores actualizar la meta, fechas y estados de una ciudad.
 */
export const updateExpansionCityV1 = functions.https.onCall(async (data: any, context) => {
    // 1. Validar usuario autenticado
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión para configurar una ciudad.");
    }

    const db = admin.firestore();

    // 2. Validar que sea admin o superadmin
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    const userData = userSnap.data();
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
        throw new functions.https.HttpsError("permission-denied", "Solo administradores pueden configurar ciudades.");
    }

    // 3. Recibir parámetros
    const { cityKey, targetApprovedDrivers, estimatedLaunchDate, operationalStatus, passengerAccessEnabled, passengerMarketingEnabled } = data;
    if (!cityKey) {
        throw new functions.https.HttpsError("invalid-argument", "El cityKey es requerido.");
    }

    // 4. Validar que cities/{cityKey} exista
    const cityRef = db.collection("cities").doc(cityKey);
    const citySnap = await cityRef.get();
    if (!citySnap.exists) {
        throw new functions.https.HttpsError("not-found", `La ciudad no existe (cityKey: ${cityKey}).`);
    }

    const updates: any = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid
    };

    if (operationalStatus !== undefined) {
        updates.operationalStatus = operationalStatus;
    }

    if (targetApprovedDrivers !== undefined) {
        updates["driverRecruitment.targetApprovedDrivers"] = Number(targetApprovedDrivers);
    }

    if (estimatedLaunchDate !== undefined) {
        updates["driverRecruitment.estimatedLaunchDate"] = estimatedLaunchDate || null;
    }

    if (passengerAccessEnabled !== undefined) {
        updates["passengerAccess.enabled"] = passengerAccessEnabled;
    }

    if (passengerMarketingEnabled !== undefined) {
        updates["passengerAccess.marketingEnabled"] = passengerMarketingEnabled;
    }

    await cityRef.update(updates);

    return {
        success: true,
        cityKey
    };
});

/**
 * VALIDATE INVITATION V1
 * Valida un token de forma segura en el backend (bypass de reglas de firestore).
 */
export const validateInvitationV1 = functions.https.onCall(async (data: any) => {
    const { cityKey, token } = data;

    if (!cityKey || !token) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan parámetros.");
    }

    try {
        const db = admin.firestore();
        const target = normalize(cityKey);

        // 1. Buscar la invitación
        const invitesSnap = await db.collection("municipal_onboarding_invites")
            .where("token", "==", token)
            .where("status", "==", "sent")
            .get();

        if (invitesSnap.empty) {
            throw new functions.https.HttpsError("not-found", "Invitación no encontrada o procesada.");
        }

        const inviteDoc = invitesSnap.docs.find(d => normalize(d.data().cityKey) === target);
        if (!inviteDoc) {
            throw new functions.https.HttpsError("not-found", "El código de ciudad no coincide.");
        }

        const invitation = inviteDoc.data();

        // 2. Buscar la ciudad
        const citiesSnap = await db.collection("cities").get();
        const cityDoc = citiesSnap.docs.find(d => 
            normalize(d.id) === target || 
            normalize(d.data().cityKey || "") === target ||
            normalize(d.data().name || "") === target
        );

        if (!cityDoc) {
            throw new functions.https.HttpsError("not-found", "Ciudad no encontrada.");
        }

        return {
            invitation: { 
                ...invitation,
                expiresAt: invitation.expiresAt?.toDate().toISOString() 
            },
            city: { 
                id: cityDoc.id,
                ...cityDoc.data() 
            }
        };
    } catch (error: any) {
        console.error("Error en validateInvitationV1:", error);
        throw new functions.https.HttpsError("internal", error.message || "Error interno.");
    }
});

/**
 * FINALIZE ONBOARDING V1
 */
export const finalizeOnboardingV1 = functions.https.onCall(async (data: any, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Autenticación requerida.");
    
    const db = admin.firestore();
    const { cityKey, token } = data;

    if (!cityKey || !token) throw new functions.https.HttpsError("invalid-argument", "Faltan parámetros.");

    const inviteQuery = await db.collection("municipal_onboarding_invites")
        .where("token", "==", token)
        .where("status", "==", "sent")
        .get();

    const inviteDoc = inviteQuery.docs.find(d => normalize(d.data().cityKey) === normalize(cityKey));
    if (!inviteDoc) throw new functions.https.HttpsError("not-found", "Invitación no válida.");

    const batch = db.batch();
    
    // Update City
    const cityRef = db.collection("cities").doc(cityKey);
    batch.update(cityRef, {
        status: 'active',
        enabled: true,
        adminUserId: context.auth.uid,
        updatedAt: FieldValue.serverTimestamp()
    });

    // Update User (use set with merge to avoid 'no document to update' errors for newly created users)
    const userRef = db.collection("users").doc(context.auth.uid);
    batch.set(userRef, {
        role: 'admin_municipal',
        cityKey,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Mark Invite Used
    batch.update(inviteDoc.ref, { 
        status: 'accepted', 
        acceptedAt: FieldValue.serverTimestamp(),
        adminUserId: context.auth.uid 
    });

    await batch.commit();
    return { success: true };
});
/**
 * SELF REGISTER MUNICIPALITY V1
 * Permite a un usuario autenticado crear su propia ciudad y asignarse como admin.
 * (Bypass de reglas de firestore)
 */
export const selfRegisterMunicipalityV1 = functions.https.onCall(async (data: any, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes estar logueado.");
    }

    const db = admin.firestore();
    const { cityKey, name, province, email } = data;

    if (!cityKey || !name || !email) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan campos obligatorios.");
    }

    const batch = db.batch();

    // 1. Crear Ciudad
    const cityRef = db.collection("cities").doc(cityKey);
    batch.set(cityRef, {
        cityKey,
        name,
        province: province || '',
        country: 'Argentina',
        status: 'active',
        adminUserId: context.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        config: {
            pricingModel: 'standard',
            fapEnabled: true,
            broadcastEnabled: true
        },
        enabled: true,
        rewardsConfig: {
            basePoolAmount: 2000,
            weeklyPoolAmount: 2000,
            minPointsToQualify: 20,
            totalWeeklyPoints: 0,
            qualifiedDriversCount: 0,
            updatedAt: FieldValue.serverTimestamp()
        }
    }, { merge: true });

    // 2. Crear Perfil de Usuario
    const userRef = db.collection("users").doc(context.auth.uid);
    batch.set(userRef, {
        uid: context.auth.uid,
        email: email,
        role: 'admin_municipal',
        cityKey: cityKey,
        name: `Admin ${name}`,
        createdAt: FieldValue.serverTimestamp(),
        profileCompleted: true,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    return { success: true };
});

export const internalRecalculateCityStats = async (cityKey: string, db: admin.firestore.Firestore) => {
    const cityRef = db.doc(`cities/${cityKey}`);
    const citySnap = await cityRef.get();
    
    if (!citySnap.exists) {
        return null;
    }

    const cityData = citySnap.data() as any;
    if (cityData.operationalStatus === 'active' || !cityData.driverRecruitment?.enabled) {
        return null; // Do not recalculate for active cities or cities without recruitment enabled
    }

    const usersSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .where('cityKey', '==', cityKey)
        .get();

    let registeredCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let enabledCount = 0;

    for (const doc of usersSnap.docs) {
        const user = doc.data() as any;
        registeredCount++;

        if (user.approved) {
            approvedCount++;
            if (!user.isSuspended && !user.adminSuspended && !user.municipalSuspended && !user.trafficSuspended) {
                enabledCount++;
            }
        } else {
            if (user.municipalStatus === 'pending_municipal_review' || user.municipalStatus === 'renewal_under_review') {
                pendingCount++;
            } else if (user.municipalStatus === 'rejected_by_municipality' || user.registrationStatus === 'rejected') {
                rejectedCount++;
            } else {
                pendingCount++; 
            }
        }
    }

    const rec = cityData.driverRecruitment || {};
    const updates: any = {
        "driverRecruitment.registeredDriversCount": registeredCount,
        "driverRecruitment.pendingDriversCount": pendingCount,
        "driverRecruitment.approvedDriversCount": approvedCount,
        "driverRecruitment.rejectedDriversCount": rejectedCount,
        "driverRecruitment.enabledDriversCount": enabledCount,
        "updatedAt": FieldValue.serverTimestamp()
    };

    let newlyReady = false;
    if (rec.targetApprovedDrivers > 0 && approvedCount >= rec.targetApprovedDrivers && !rec.readyForPassengerMarketing) {
        updates["driverRecruitment.readyForPassengerMarketing"] = true;
        updates["operationalStatus"] = "ready_for_passengers";
        newlyReady = true;
    }

    await cityRef.update(updates);

    if (newlyReady) {
        await db.collection('admin_notifications').doc(`city_ready_${cityKey}`).set({
            type: "city_ready_for_passengers",
            cityKey,
            cityName: cityData.name || cityKey,
            approvedDriversCount: approvedCount,
            targetApprovedDrivers: rec.targetApprovedDrivers,
            message: `${cityData.name || cityKey} alcanzó ${rec.targetApprovedDrivers} conductores aprobados. Lista para activar publicidad a pasajeros.`,
            status: "unread",
            createdAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }

    return {
        registeredDriversCount: registeredCount,
        pendingDriversCount: pendingCount,
        approvedDriversCount: approvedCount,
        rejectedDriversCount: rejectedCount,
        enabledDriversCount: enabledCount,
        newlyReady
    };
};

/**
 * Recalculates driver recruitment statistics for a given city based on real user and municipal profile data.
 */
export const recalculateCityRecruitmentStatsV1 = functions.https.onCall(async (data: any, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { cityKey } = data;
    if (!cityKey) throw new functions.https.HttpsError('invalid-argument', 'cityKey es requerido');

    if (context.auth.token.role !== 'admin' && context.auth.token.role !== 'superadmin' && 
        context.auth.token.r !== 'admin' && context.auth.token.r !== 'superadmin' &&
        !context.auth.token.superadmin) {
        throw new functions.https.HttpsError('permission-denied', 'Solo administradores pueden ejecutar esta acción.');
    }

    const db = admin.firestore();
    const stats = await internalRecalculateCityStats(cityKey, db);

    if (!stats) {
        throw new functions.https.HttpsError('failed-precondition', 'La ciudad no existe, ya está activa, o no tiene reclutamiento habilitado.');
    }

    return {
        success: true,
        cityKey,
        stats
    };
});

/**
 * Trigger to automatically recalculate city recruitment stats when a new driver registers.
 */
export const onDriverCreatedForRecruitmentV1 = onDocumentCreated({ document: "users/{userId}", region: "us-central1" }, async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    if (data.role === 'driver' && data.cityKey) {
        const db = admin.firestore();
        await internalRecalculateCityStats(data.cityKey, db);
    }
});

/**
 * Trigger to automatically recalculate city recruitment stats when a driver's status changes.
 */
export const onDriverUpdatedForRecruitmentV1 = onDocumentUpdated({ document: "users/{userId}", region: "us-central1" }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only process drivers
    if (after.role !== 'driver' && before.role !== 'driver') return;

    // Check if relevant fields changed
    const relevantFieldsChanged = 
        before.approved !== after.approved ||
        before.isSuspended !== after.isSuspended ||
        before.municipalStatus !== after.municipalStatus ||
        before.registrationStatus !== after.registrationStatus ||
        before.adminSuspended !== after.adminSuspended ||
        before.trafficSuspended !== after.trafficSuspended ||
        before.municipalSuspended !== after.municipalSuspended ||
        before.cityKey !== after.cityKey;

    if (relevantFieldsChanged) {
        const db = admin.firestore();
        
        // If city changed, update both old and new city
        if (before.cityKey && before.cityKey !== after.cityKey) {
            await internalRecalculateCityStats(before.cityKey, db);
        }
        
        if (after.cityKey) {
            await internalRecalculateCityStats(after.cityKey, db);
        }
    }
});
