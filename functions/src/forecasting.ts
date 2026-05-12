
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import * as geofire from "geofire-common";

const db = admin.firestore();

/**
 * generateDemandPatternsV1
 * Runs every night to update historical demand patterns.
 * Consolidates 'heatmap_demand' into 'demand_patterns' with temporal dimensions.
 */
export const generateDemandPatternsV1 = onSchedule("0 3 * * *", async (event) => {
    logger.info("[FORECASTING] Generating demand patterns...");
    
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0-6
    const hour = now.getHours();

    try {
        const heatmapSnap = await db.collection('heatmap_demand').get();
        
        const batch = db.batch();
        let count = 0;

        const cityAverages: Record<string, number> = {};

        for (const doc of heatmapSnap.docs) {
            const data = doc.data();
            const geohash = data.geohash;
            const cityKey = data.cityKey;
            const recentCount = data.count || 0;

            cityAverages[cityKey] = (cityAverages[cityKey] || 0) + recentCount;

            const patternId = `${cityKey}_${geohash}_${dayOfWeek}_${hour}`;
            const patternRef = db.collection('demand_patterns').doc(patternId);

            batch.set(patternRef, {
                cityKey,
                geohash,
                dayOfWeek,
                hour,
                avgDemand: admin.firestore.FieldValue.increment(recentCount / 7), // Simplistic rolling avg
                lastSampleCount: recentCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Reset heatmap counter for the next window
            batch.update(doc.ref, { count: 0, lastResetAt: admin.firestore.FieldValue.serverTimestamp() });
            
            count++;
            if (count >= 400) {
                await batch.commit();
                count = 0;
            }
        }
        
        // Save City Summaries
        for (const cityKey in cityAverages) {
            const summaryId = `${cityKey}_${dayOfWeek}_${hour}`;
            batch.set(db.collection('city_demand_patterns').doc(summaryId), {
                cityKey,
                dayOfWeek,
                hour,
                totalAvgDemand: admin.firestore.FieldValue.increment(cityAverages[cityKey] / 7),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        if (count > 0) await batch.commit();
        logger.info(`[FORECASTING] Patterns updated for ${heatmapSnap.size} cells.`);

    } catch (error: any) {
        logger.error("[FORECASTING_ERROR]", error.message);
    }
});

/**
 * predictDemandV1
 * Returns predicted demand for a location at the current time + 1 hour.
 */
export const predictDemandV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const { lat, lng } = request.data;
    if (!lat || !lng) throw new HttpsError('invalid-argument', 'Coordenadas requeridas.');

    const geohash = geofire.geohashForLocation([lat, lng]).substring(0, 6);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const nextHour = (now.getHours() + 1) % 24;

    const patternId = `${request.data.cityKey || 'unknown'}_${geohash}_${dayOfWeek}_${nextHour}`;
    const patternSnap = await db.collection('demand_patterns').doc(patternId).get();

    if (!patternSnap.exists) {
        return { predictedDemand: 'low', score: 0, reason: 'No hay datos históricos suficientes.' };
    }

    const data = patternSnap.data();
    const avg = data?.avgDemand || 0;

    let level = 'low';
    if (avg > 10) level = 'high';
    else if (avg > 5) level = 'medium';

    return {
        predictedDemand: level,
        score: avg,
        window: `${nextHour}:00 - ${(nextHour + 1) % 24}:00`,
        geohash
    };
});
