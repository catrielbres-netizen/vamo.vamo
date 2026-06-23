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

// --- CITY AUDIT DASHBOARD ---

export const adminGetCityMetricsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    const { cityKey } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'Missing cityKey');
    const db = getDb();

    try {
        const opSnap = await db.doc(`users/${request.auth.uid}`).get();
        const op = opSnap.data();
        if (!op || (op.role !== 'admin' && op.role !== 'superadmin')) throw new HttpsError('permission-denied', 'No tienes permisos');

        const driversCountSnap = await db.collection('users').where('cityKey', '==', cityKey).where('driverStatus', 'in', ['pending_municipal_review', 'active', 'online', 'busy']).count().get();
        const passengersCountSnap = await db.collection('users').where('cityKey', '==', cityKey).where('passengerStatus', 'in', ['active', 'blocked']).count().get();
        const ridesCountSnap = await db.collection('rides').where('cityKey', '==', cityKey).count().get();

        // Calculate FAP total
        const fapSnap = await db.collection('fap_claims').where('cityKey', '==', cityKey).where('status', '==', 'paid').get();
        let totalFapPaid = 0;
        fapSnap.docs.forEach(d => totalFapPaid += (d.data().approvedAmount || 0));

        return {
            totalDrivers: driversCountSnap.data().count,
            totalPassengers: passengersCountSnap.data().count,
            totalRides: ridesCountSnap.data().count,
            totalFapPaid
        };
    } catch (error: any) {
        logger.error("[adminGetCityMetricsV1] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

export const adminGetCityRidesV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    const { cityKey, filterDateStart, filterDateEnd, filterDriverId, filterPassengerId, filterStatus, limit: queryLimit = 50 } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'Missing cityKey');
    const db = getDb();

    try {
        const opSnap = await db.doc(`users/${request.auth.uid}`).get();
        const op = opSnap.data();
        if (!op || (op.role !== 'admin' && op.role !== 'superadmin')) throw new HttpsError('permission-denied', 'No tienes permisos');

        let q = db.collection('rides').where('cityKey', '==', cityKey);
        
        if (filterDriverId) q = q.where('driverId', '==', filterDriverId);
        if (filterPassengerId) q = q.where('passengerId', '==', filterPassengerId);
        if (filterStatus && filterStatus !== 'all') q = q.where('status', '==', filterStatus);
        
        // Complex index fallback
        q = q.orderBy('createdAt', 'desc').limit(queryLimit);

        const snap = await q.get();
        const rides = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let filteredRides = rides;
        if (filterDateStart && filterDateEnd) {
             const start = new Date(filterDateStart).getTime();
             const end = new Date(filterDateEnd).getTime();
             filteredRides = rides.filter((r: any) => {
                 const t = r.createdAt?.toDate ? r.createdAt.toDate().getTime() : r.createdAt;
                 return t >= start && t <= end;
             });
        }

        return { rides: filteredRides };
    } catch (error: any) {
        logger.error("[adminGetCityRidesV1] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

export const adminGetCityFapClaimsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    const { cityKey, limit: queryLimit = 50 } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'Missing cityKey');
    const db = getDb();

    try {
        const opSnap = await db.doc(`users/${request.auth.uid}`).get();
        const op = opSnap.data();
        if (!op || (op.role !== 'admin' && op.role !== 'superadmin')) throw new HttpsError('permission-denied', 'No tienes permisos');

        let q = db.collection('fap_claims').where('cityKey', '==', cityKey).orderBy('createdAt', 'desc').limit(queryLimit);
        const snap = await q.get();
        const claims = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { claims };
    } catch (error: any) {
        logger.error("[adminGetCityFapClaimsV1] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

export const adminGetCityFinancialsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    const { cityKey } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'Missing cityKey');
    const db = getDb();

    try {
        const opSnap = await db.doc(`users/${request.auth.uid}`).get();
        const op = opSnap.data();
        if (!op || (op.role !== 'admin' && op.role !== 'superadmin')) throw new HttpsError('permission-denied', 'No tienes permisos');

        // 1. Get City Data (for total commissions and weekly pool)
        const citySnap = await db.doc(`cities/${cityKey}`).get();
        const cityData = citySnap.data() || {};
        
        const totalPlatformCommission = cityData.stats?.totalPlatformCommission || 0;
        const totalMunicipalCommission = cityData.stats?.totalMunicipalCommission || 0;
        const weeklyPoolAmount = cityData.rewardsConfig?.weeklyPoolAmount || 0;

        // 2. Aggregate VamO Pay vs Cash directly from Rides
        const vamoPayAggr = await db.collection('rides')
            .where('cityKey', '==', cityKey)
            .where('status', '==', 'completed')
            .aggregate({
                totalVamoPay: admin.firestore.AggregateField.sum('walletCoveredAmount'),
                totalCash: admin.firestore.AggregateField.sum('cashAmount')
            }).get();

        const vamoPayData = vamoPayAggr.data();

        // 3. Count rides by payment method
        const vamoPayRidesCount = await db.collection('rides')
            .where('cityKey', '==', cityKey)
            .where('status', '==', 'completed')
            .where('paymentMethod', '==', 'wallet')
            .count().get();

        return {
            totalPlatformCommission,
            totalMunicipalCommission,
            weeklyPoolAmount,
            totalVamoPay: vamoPayData.totalVamoPay || 0,
            totalCash: vamoPayData.totalCash || 0,
            vamoPayRidesCount: vamoPayRidesCount.data().count
        };
    } catch (error: any) {
        logger.error("[adminGetCityFinancialsV1] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

// Broadcast Message
export const adminBroadcastMessageV1 = onCall(async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión.');
    
    const db = admin.firestore();
    const userDoc = await db.doc(`users/${auth.uid}`).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'superadmin', 'municipal'].includes(role)) {
        throw new HttpsError('permission-denied', 'No tiene permisos.');
    }

    const { cityKey, targetRole, channels, title, body } = data;
    if (!cityKey || !targetRole || !channels || !title || !body) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
        let query = db.collection('users').where('role', '==', targetRole);
        if (cityKey !== 'global') {
            query = query.where('cityKey', '==', cityKey);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            return { success: true, message: 'No users found for this target.', sent: 0 };
        }

        const batch = db.batch();
        let enqueuedCount = 0;
        let pushCount = 0;
        const tokens: string[] = [];

        snapshot.docs.forEach(doc => {
            const userData = doc.data();

            // Email
            if (channels.includes('email') && userData.email) {
                const mailQueueRef = db.collection('mail_queue').doc();
                batch.set(mailQueueRef, {
                    to: userData.email,
                    template: 'custom_broadcast',
                    subject: title,
                    data: { title, body, name: userData.name || 'Usuario' },
                    status: 'pending',
                    attempts: 0,
                    provider: 'resend',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    dedupeKey: `broadcast_${doc.id}_${Date.now()}`
                });
                enqueuedCount++;
            }

            // Push Notification Tokens
            if (channels.includes('push') && userData.fcmToken) {
                tokens.push(userData.fcmToken);
            }
        });

        if (enqueuedCount > 0) {
            await batch.commit();
        }

        // Send push notifications natively (max 500 per chunk as per Firebase limits)
        if (tokens.length > 0) {
            const messaging = admin.messaging();
            const chunkSize = 500;
            for (let i = 0; i < tokens.length; i += chunkSize) {
                const chunk = tokens.slice(i, i + chunkSize);
                const message = {
                    notification: { title, body },
                    tokens: chunk
                };
                await messaging.sendEachForMulticast(message).catch(e => logger.error("Push broadcast error:", e));
                pushCount += chunk.length;
            }
        }

        return { 
            success: true, 
            message: 'Broadcast sent successfully', 
            emailsEnqueued: enqueuedCount,
            pushesSent: pushCount 
        };
    } catch (error: any) {
        logger.error("[adminBroadcastMessageV1] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

