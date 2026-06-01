import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { getDb } from "./lib/firebaseAdmin";
import { Ride, SharedRideGroup, SharedRideRequest } from "./types";

/**
 * [VamO ADMIN] adminForceCloseRideV1
 * Deep search and force-close tool for stuck rides.
 * Atomically cleans up Rides, Groups, Requests, Offers and User pointers.
 */
export const adminForceCloseRideV1 = onCall({ cors: true, region: "us-central1", timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
    const { query, reason, dryRun = true } = request.data;

    if (!query) throw new HttpsError("invalid-argument", "Query is required.");
    if (!dryRun && !reason) throw new HttpsError("invalid-argument", "Reason is required for real closure.");

    // 1. SECURITY: Admin Only
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }
    
    // Check custom claims
    const role = request.auth.token.role;
    if (role !== "admin" && role !== "superadmin" && role !== "support") {
        throw new HttpsError("permission-denied", "Acceso restringido a administradores.");
    }

    const db = getDb();
    logger.info(`[ADMIN_FORCE_CLOSE] ${dryRun ? 'DRY_RUN' : 'EXECUTE'} Query: ${query} requested by ${request.auth.uid}`);

    const results: any = {
        rides: [],
        groups: [],
        requests: [],
        offers: [],
        users: [],
        drivers: []
    };

    try {
        // --- BÚSQUEDA PROFUNDA ---

        // 1. Rides
        const rideRefs = [
            db.collection('rides').doc(query),
            db.collection('rides').doc(`shared_${query}`)
        ];
        const rideSnaps = await Promise.all(rideRefs.map(ref => ref.get()));
        rideSnaps.forEach(s => { if (s.exists) results.rides.push({ id: s.id, ...s.data() }); });

        // Search by shortId/displayId/groupId
        const rideQueries = [
            db.collection('rides').where('shortId', '==', query),
            db.collection('rides').where('displayId', '==', query),
            db.collection('rides').where('sharedGroupId', '==', query),
            db.collection('rides').where('groupId', '==', query)
        ];
        const rideQuerySnaps = await Promise.all(rideQueries.map(q => q.limit(10).get()));
        rideQuerySnaps.forEach(snap => {
            snap.forEach(d => {
                if (!results.rides.find((r: any) => r.id === d.id)) {
                    results.rides.push({ id: d.id, ...d.data() });
                }
            });
        });

        // 2. Groups
        const groupRefs = [
            db.collection('shared_ride_groups').doc(query)
        ];
        const groupSnaps = await Promise.all(groupRefs.map(ref => ref.get()));
        groupSnaps.forEach(s => { if (s.exists) results.groups.push({ id: s.id, ...s.data() }); });

        const groupQueries = [
            db.collection('shared_ride_groups').where('rideId', '==', query),
            db.collection('shared_ride_groups').where('finalRideId', '==', query),
            db.collection('shared_ride_groups').where('shortId', '==', query),
            db.collection('shared_ride_groups').where('displayId', '==', query)
        ];
        const groupQuerySnaps = await Promise.all(groupQueries.map(q => q.limit(10).get()));
        groupQuerySnaps.forEach(snap => {
            snap.forEach(d => {
                if (!results.groups.find((g: any) => g.id === d.id)) {
                    results.groups.push({ id: d.id, ...d.data() });
                }
            });
        });

        // Collect related IDs for further search
        const rideIds = results.rides.map((r: any) => r.id);
        const groupIds = results.groups.map((g: any) => g.id);
        const passengerIds = new Set<string>();
        const driverIds = new Set<string>();

        results.rides.forEach((r: any) => {
            if (r.passengerId) passengerIds.add(r.passengerId);
            if (r.passengerIds) r.passengerIds.forEach((id: string) => passengerIds.add(id));
            if (r.driverId) driverIds.add(r.driverId);
        });
        results.groups.forEach((g: any) => {
            if (g.passengerIds) g.passengerIds.forEach((id: string) => passengerIds.add(id));
            if (g.driverId) driverIds.add(g.driverId);
        });

        // 3. Requests
        if (groupIds.length > 0) {
            const reqSnap = await db.collection('shared_ride_requests')
                .where('groupId', 'in', groupIds.slice(0, 10))
                .get();
            reqSnap.forEach(d => {
                results.requests.push({ id: d.id, ...d.data() });
                const r = d.data() as SharedRideRequest;
                if (r.passengerId) passengerIds.add(r.passengerId);
            });
        }

        // 4. Offers
        if (rideIds.length > 0) {
            const offerSnap = await db.collection('ride_offers')
                .where('rideId', 'in', rideIds.slice(0, 10))
                .get();
            offerSnap.forEach(d => {
                const data = d.data();
                if (['pending', 'offered', 'accepted'].includes(data.status)) {
                    results.offers.push({ id: d.id, ...data });
                }
            });
        }

        // 5. Users (Pointers)
        // Search by ID first
        if (passengerIds.size > 0 || driverIds.size > 0) {
            const affectedUserIds = Array.from(new Set([...Array.from(passengerIds), ...Array.from(driverIds)]));
            // Limit to avoid huge batches
            const slice = affectedUserIds.slice(0, 30);
            const userSnaps = await Promise.all(slice.map(uid => db.collection('users').doc(uid).get()));
            userSnaps.forEach(s => {
                if (s.exists) {
                    const data = s.data();
                    if (data?.role === 'driver') results.drivers.push({ id: s.id, ...data });
                    else results.users.push({ id: s.id, ...data });
                }
            });
        }

        // Deep User Pointers Search (Only if indices exist, else we rely on IDs above)
        const userPointerQueries = [
            db.collection('users').where('activeRideId', '==', query),
            db.collection('users').where('activeRideId', '==', `shared_${query}`)
        ];
        try {
            const userPointerSnaps = await Promise.all(userPointerQueries.map(q => q.limit(10).get()));
            userPointerSnaps.forEach(snap => {
                snap.forEach(d => {
                    const data = d.data();
                    if (data.role === 'driver') {
                        if (!results.drivers.find((dr: any) => dr.id === d.id)) results.drivers.push({ id: d.id, ...data });
                    } else {
                        if (!results.users.find((u: any) => u.id === d.id)) results.users.push({ id: d.id, ...data });
                    }
                });
            });
        } catch (e) {
            logger.warn("[ADMIN_FORCE_CLOSE] Skipping deep user pointer search (missing indices?).", e);
        }

        if (dryRun) {
            return {
                ok: true,
                dryRun: true,
                candidates: results,
                recommendedAction: results.rides.length > 0 || results.groups.length > 0 ? "force_close_detected_ride" : "none"
            };
        }

        // --- EXECUCIÓN (REAL CLOSURE) ---
        const closedRideIds: string[] = [];
        const closedGroupIds: string[] = [];
        const cleanedUserIds: string[] = [];
        const cancelledOffersCount = results.offers.length;
        const cancelledRequestsCount = results.requests.length;

        await db.runTransaction(async (tx) => {
            // 1. Close Rides
            results.rides.forEach((r: any) => {
                tx.update(db.collection('rides').doc(r.id), {
                    status: "cancelled_by_admin",
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    cancelReason: reason,
                    adminForceClosed: true,
                    adminForceClosedAt: admin.firestore.FieldValue.serverTimestamp(),
                    adminForceClosedBy: request.auth?.uid,
                    previousStatus: r.status,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                closedRideIds.push(r.id);
            });

            // 2. Close Groups
            results.groups.forEach((g: any) => {
                tx.update(db.collection('shared_ride_groups').doc(g.id), {
                    status: "cancelled_by_admin",
                    isPubliclyJoinable: false,
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    cancelledReason: reason,
                    adminForceClosed: true,
                    adminForceClosedAt: admin.firestore.FieldValue.serverTimestamp(),
                    adminForceClosedBy: request.auth?.uid,
                    previousStatus: g.status,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                closedGroupIds.push(g.id);
            });

            // 3. Close Requests
            results.requests.forEach((req: any) => {
                tx.update(db.collection('shared_ride_requests').doc(req.id), {
                    status: "cancelled_by_admin",
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    cancelReason: reason,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            // 4. Cancel Offers
            results.offers.forEach((off: any) => {
                tx.update(db.collection('ride_offers').doc(off.id), {
                    status: "cancelled_by_admin",
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    cancelReason: reason,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            // 5. Clean Passengers
            results.users.forEach((u: any) => {
                tx.update(db.collection('users').doc(u.id), {
                    activeRideId: admin.firestore.FieldValue.delete(),
                    activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    activeSharedRequestId: admin.firestore.FieldValue.delete(),
                    currentSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    sharedRideStatus: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                cleanedUserIds.push(u.id);
            });

            // 6. Clean Drivers
            results.drivers.forEach((d: any) => {
                tx.update(db.collection('users').doc(d.id), {
                    activeRideId: admin.firestore.FieldValue.delete(),
                    currentRideId: admin.firestore.FieldValue.delete(),
                    driverStatus: "online", 
                    isAvailable: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastAdminCleanupAt: admin.firestore.FieldValue.serverTimestamp()
                });
                cleanedUserIds.push(d.id);
            });
        });

        // 7. AUDIT LOG
        await db.collection('admin_audit_logs').add({
            action: "admin_force_close_ride",
            query,
            reason,
            adminUid: request.auth.uid,
            adminEmail: request.auth.token.email || 'unknown',
            foundRideIds: closedRideIds,
            foundGroupIds: closedGroupIds,
            affectedUserIds: cleanedUserIds,
            cancelledOffersCount,
            cancelledRequestsCount,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            ok: true,
            closedRideIds,
            closedGroupIds,
            cleanedUserIds,
            cancelledOffersCount,
            cancelledRequestsCount
        };

    } catch (error: any) {
        logger.error("[ADMIN_FORCE_CLOSE_ERROR]", error);
        throw new HttpsError("internal", error.message || "Error al forzar cierre de viaje.");
    }
});
