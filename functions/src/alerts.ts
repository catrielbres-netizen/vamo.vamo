
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * checkSystemHealthV1
 * Runs every 10 minutes to detect operational anomalies.
 */
export const checkSystemHealthV1 = onSchedule("every 10 minutes", async (event) => {
    logger.info("[ALERTS] Starting system health check...");
    
    try {
        const citiesSnap = await db.collection('cities').where('status', '==', 'active').get();
        
        for (const cityDoc of citiesSnap.docs) {
            const cityKey = cityDoc.id;
            const cityName = cityDoc.data().name || cityKey;

            // 1. Check Driver Supply
            const driversSnap = await db.collection('drivers_locations')
                .where('cityKey', '==', cityKey)
                .where('driverStatus', 'in', ['online', 'in_ride'])
                .get();
            
            const activeDrivers = driversSnap.size;
            const MIN_DRIVERS = 3;

            if (activeDrivers < MIN_DRIVERS) {
                await triggerAlert(cityKey, 'LOW_SUPPLY', {
                    title: `Poca oferta en ${cityName}`,
                    message: `Solo hay ${activeDrivers} conductores online. Riesgo de degradación de servicio.`,
                    severity: 'warning',
                    activeDrivers
                });
            }

            // 2. Check Cancellation Rate (Last 30 mins)
            const thirtyMinsAgo = new Date(Date.now() - (30 * 60 * 1000));
            const ridesSnap = await db.collection('rides')
                .where('cityKey', '==', cityKey)
                .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(thirtyMinsAgo))
                .get();
            
            const totalRides = ridesSnap.size;
            if (totalRides >= 5) {
                const cancelled = ridesSnap.docs.filter(d => d.data().status === 'cancelled').length;
                const cancelRate = cancelled / totalRides;

                if (cancelRate > 0.4) { // > 40% cancellation
                    await triggerAlert(cityKey, 'HIGH_CANCELLATION', {
                        title: `Cancelaciones altas en ${cityName}`,
                        message: `Tasa de cancelación del ${(cancelRate * 100).toFixed(0)}% en los últimos 30 min (${cancelled}/${totalRides}).`,
                        severity: 'critical',
                        cancelRate
                    });
                }
            }

            // 3. Predictive Shortage Alert (Last hour of day/week vs Current Supply)
            const now = new Date();
            const dayOfWeek = now.getDay();
            const nextHour = (now.getHours() + 1) % 24;
            const summaryId = `${cityKey}_${dayOfWeek}_${nextHour}`;
            
            const patternSnap = await db.collection('city_demand_patterns').doc(summaryId).get();
            if (patternSnap.exists) {
                const expectedDemand = patternSnap.data()?.totalAvgDemand || 0;
                if (expectedDemand > activeDrivers * 2 && expectedDemand > 5) {
                    await triggerAlert(cityKey, 'PREDICTIVE_SHORTAGE', {
                        title: `Escasez prevista en ${cityName}`,
                        message: `Se prevén ~${expectedDemand.toFixed(0)} viajes para la próxima hora, pero solo hay ${activeDrivers} conductores online.`,
                        severity: 'warning',
                        expectedDemand,
                        activeDrivers
                    });
                }
            }
        }
    } catch (error: any) {
        logger.error("[ALERTS_ERROR] Health check failed:", error.message);
    }
});

async function triggerAlert(cityKey: string, type: string, data: any) {
    const alertId = `${cityKey}_${type}_${Math.floor(Date.now() / (60 * 60 * 1000))}`; // Hourly deduplication
    
    const alertData = {
        cityKey,
        type,
        ...data,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // TTL 2h
    };

    await db.collection('system_alerts').doc(alertId).set(alertData, { merge: true });
    logger.warn(`🚨 [ALERT_TRIGGERED] ${type} for ${cityKey}`);
}
