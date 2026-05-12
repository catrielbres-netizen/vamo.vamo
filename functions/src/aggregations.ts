
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * aggregateCityMetricsHourlyV1
 * Runs every hour to consolidate operational and financial data.
 */
export const aggregateCityMetricsHourlyV1 = onSchedule("every 1 hours", async (event) => {
    logger.info("[AGGREGATION] Starting hourly city metrics consolidation...");
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (65 * 60 * 1000)); // 65 min buffer
    const hourId = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}`;

    try {
        // 1. Get all cities
        const citiesSnap = await db.collection('cities').get();
        if (citiesSnap.empty) {
            logger.warn("[AGGREGATION] No cities found to aggregate.");
            return;
        }

        for (const cityDoc of citiesSnap.docs) {
            const cityKey = cityDoc.id;
            logger.info(`[AGGREGATION] Processing city: ${cityKey}`);

            // 2. Fetch rides from last hour
            const ridesSnap = await db.collection('rides')
                .where('cityKey', '==', cityKey)
                .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
                .get();

            let ridesCount = 0;
            let completedCount = 0;
            let cancelledCount = 0;
            let totalGMV = 0;
            let vamoRevenue = 0;
            let muniRevenue = 0;
            let driverEarnings = 0;
            let subsidiesAmount = 0;

            ridesSnap.forEach(doc => {
                const ride = doc.data();
                ridesCount++;
                if (ride.status === 'completed') {
                    completedCount++;
                    const cRide = ride.completedRide || {};
                    totalGMV += (cRide.totalFare || 0);
                    vamoRevenue += (cRide.commissionAmount || 0);
                    muniRevenue += (cRide.municipalFee || 0);
                    driverEarnings += (cRide.driverNetAmount || 0);
                    subsidiesAmount += (cRide.vamoSubsidyAmount || 0);
                } else if (ride.status === 'cancelled') {
                    cancelledCount++;
                }
            });

            // 3. Active Users (Online Drivers)
            const driversSnap = await db.collection('drivers_locations')
                .where('cityKey', '==', cityKey)
                .where('driverStatus', 'in', ['online', 'in_ride'])
                .get();
            const activeDrivers = driversSnap.size;

            // 4. Save Metric
            const metricId = `${cityKey}_${hourId}`;
            const metricData = {
                cityKey,
                hourId,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                stats: {
                    ridesCount,
                    completedCount,
                    cancelledCount,
                    totalGMV,
                    vamoRevenue,
                    muniRevenue,
                    driverEarnings,
                    subsidiesAmount,
                    netPlatformMargin: vamoRevenue - subsidiesAmount,
                    activeDrivers
                },
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('city_metrics_hourly').doc(metricId).set(metricData, { merge: true });
            logger.info(`✅ [AGGREGATION] Metric saved for ${cityKey}: ${metricId}`);
        }

        logger.info("[AGGREGATION] Hourly consolidation complete.");
    } catch (error: any) {
        logger.error("[AGGREGATION_ERROR] Fatal error in hourly task:", error.message);
    }
});

/**
 * aggregateCityMetricsDailyV1
 * Summarizes hourly data into daily reports for long-term analytics.
 */
export const aggregateCityMetricsDailyV1 = onSchedule("0 1 * * *", async (event) => {
    logger.info("[AGGREGATION] Starting daily city metrics consolidation...");
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayId = `${yesterday.getFullYear()}-${(yesterday.getMonth() + 1).toString().padStart(2, '0')}-${yesterday.getDate().toString().padStart(2, '0')}`;

    try {
        const citiesSnap = await db.collection('cities').get();
        
        let globalStats = {
            ridesCount: 0,
            completedCount: 0,
            cancelledCount: 0,
            totalGMV: 0,
            vamoRevenue: 0,
            muniRevenue: 0,
            driverEarnings: 0,
            subsidiesAmount: 0,
            netPlatformMargin: 0
        };

        for (const cityDoc of citiesSnap.docs) {
            const cityKey = cityDoc.id;
            
            // Fetch all hourly metrics for yesterday
            const hourlySnap = await db.collection('city_metrics_hourly')
                .where('cityKey', '==', cityKey)
                .where('hourId', '>=', `${dayId}-00`)
                .where('hourId', '<=', `${dayId}-23`)
                .get();

            let dailyStats = {
                ridesCount: 0,
                completedCount: 0,
                cancelledCount: 0,
                totalGMV: 0,
                vamoRevenue: 0,
                muniRevenue: 0,
                driverEarnings: 0,
                subsidiesAmount: 0,
                netPlatformMargin: 0,
                peakDrivers: 0
            };

            hourlySnap.forEach(doc => {
                const h = doc.data().stats;
                dailyStats.ridesCount += h.ridesCount;
                dailyStats.completedCount += h.completedCount;
                dailyStats.cancelledCount += h.cancelledCount;
                dailyStats.totalGMV += h.totalGMV;
                dailyStats.vamoRevenue += h.vamoRevenue;
                dailyStats.muniRevenue += h.muniRevenue;
                dailyStats.driverEarnings += h.driverEarnings;
                dailyStats.subsidiesAmount += h.subsidiesAmount;
                dailyStats.netPlatformMargin += h.netPlatformMargin;
                dailyStats.peakDrivers = Math.max(dailyStats.peakDrivers, h.activeDrivers);
            });

            // Add to global
            globalStats.ridesCount += dailyStats.ridesCount;
            globalStats.completedCount += dailyStats.completedCount;
            globalStats.cancelledCount += dailyStats.cancelledCount;
            globalStats.totalGMV += dailyStats.totalGMV;
            globalStats.vamoRevenue += dailyStats.vamoRevenue;
            globalStats.muniRevenue += dailyStats.muniRevenue;
            globalStats.driverEarnings += dailyStats.driverEarnings;
            globalStats.subsidiesAmount += dailyStats.subsidiesAmount;
            globalStats.netPlatformMargin += dailyStats.netPlatformMargin;

            const metricId = `${cityKey}_${dayId}`;
            await db.collection('city_metrics_daily').doc(metricId).set({
                cityKey,
                dayId,
                stats: dailyStats,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            logger.info(`✅ [AGGREGATION] Daily metric saved for ${cityKey}: ${metricId}`);
        }

        // Save Global Daily Metric
        await db.collection('platform_metrics_daily').doc(dayId).set({
            dayId,
            stats: globalStats,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        logger.info(`🌐 [AGGREGATION] Global daily metric saved: ${dayId}`);

    } catch (error: any) {
        logger.error("[AGGREGATION_ERROR] Fatal error in daily task:", error.message);
    }
});
