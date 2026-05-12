import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
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
    
    const baseUrl = process.env.VAMO_BASE_URL || 'https://vamoapp.online';
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

    // Update User
    const userRef = db.collection("users").doc(context.auth.uid);
    batch.update(userRef, {
        role: 'admin_municipal',
        cityKey,
        updatedAt: FieldValue.serverTimestamp()
    });

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
