import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as geofire from "geofire-common";
import { getDb } from "./lib/firebaseAdmin";
import { Ride, RideTrackingPoint } from "./types";
import { logLedgerEvent } from "./lib/audit";

const TRACKING_DISTANCE_THRESHOLD_METERS = 50;
const TRACKING_TIME_THRESHOLD_SECONDS = 10;

/**
 * [VamO PRO] Ride Tracking Trigger
 * Listens to driver location updates and saves points during active rides.
 */
export const onDriverLocationUpdateTrackingV1 = onDocumentUpdated({
    document: "drivers_locations/{driverId}",
    region: "us-central1"
}, async (event) => {
    const db = getDb();
    const driverId = event.params.driverId;
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();

    if (!newData || !newData.currentLocation) return;

    // Only track if driver is in_ride
    if (newData.driverStatus !== 'in_ride') return;

    try {
        // 1. Get the active ride for this driver
        // We look for a ride where driverId matches and status is in [driver_arrived, in_progress]
        const rideSnap = await db.collection('rides')
            .where('driverId', '==', driverId)
            .where('status', 'in', ['driver_arrived', 'in_progress'])
            .limit(1)
            .get();

        if (rideSnap.empty) return;

        const rideDoc = rideSnap.docs[0];
        const ride = rideDoc.data() as Ride;
        const rideId = rideDoc.id;

        const newLat = newData.currentLocation.lat;
        const newLng = newData.currentLocation.lng;

        // 2. Throttling Check
        const lastPointSnap = await db.collection('ride_tracking')
            .doc(rideId)
            .collection('points')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (!lastPointSnap.empty) {
            const lastPoint = lastPointSnap.docs[0].data() as RideTrackingPoint;
            const lastLat = lastPoint.lat;
            const lastLng = lastPoint.lng;
            const lastTime = (lastPoint.timestamp as Timestamp).toMillis();
            const now = Date.now();

            const distance = geofire.distanceBetween([lastLat, lastLng], [newLat, newLng]) * 1000; // in meters
            const timeDiff = (now - lastTime) / 1000;

            if (distance < TRACKING_DISTANCE_THRESHOLD_METERS && timeDiff < TRACKING_TIME_THRESHOLD_SECONDS) {
                // Skip save to avoid noise
                return;
            }
        }

        // 3. Save Point
        const pointId = `pt_${Date.now()}`;
        const point: RideTrackingPoint = {
            rideId,
            driverId,
            passengerId: ride.passengerId,
            cityKey: ride.cityKey,
            lat: newLat,
            lng: newLng,
            timestamp: FieldValue.serverTimestamp(),
            actor: 'driver',
            source: 'app',
            accuracy: newData.accuracy || 0,
            speed: newData.speed || 0,
            heading: newData.heading || 0
        };

        await db.collection('ride_tracking').doc(rideId).collection('points').doc(pointId).set(point);

        // Optional: Log to ledger for high-granularity audit (careful with volume)
        // await logLedgerEvent({
        //    eventType: 'ride_tracking_point_saved',
        //    actorId: driverId,
        //    actorRole: 'driver',
        //    rideId,
        //    cityKey: ride.cityKey
        // });

    } catch (error) {
        logger.error(`[TRACKING_ERROR] Driver ${driverId}:`, error);
    }
});
