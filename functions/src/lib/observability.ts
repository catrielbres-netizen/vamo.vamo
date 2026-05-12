
import { logger } from "firebase-functions";

/**
 * [VamO PRO] Actionable Observability Wrapper
 * Structured logging for operational monitoring.
 */
export const obs = {
    info: (event: string, metadata: any = {}) => {
        logger.info(`[INFO] ${event}`, { ...metadata, timestamp: new Date().toISOString() });
    },
    
    warn: (event: string, metadata: any = {}) => {
        logger.warn(`[WARN] ${event}`, { ...metadata, timestamp: new Date().toISOString() });
    },
    
    error: (event: string, error: any, metadata: any = {}) => {
        logger.error(`[ERROR] ${event}`, {
            message: error.message || error,
            stack: error.stack,
            ...metadata,
            timestamp: new Date().toISOString()
        });
    },

    /**
     * trackLatency
     * Logs execution time for critical operations.
     * Persists to DB if exceeds 1000ms (High Latency).
     */
    trackLatency: async (name: string, startTime: number, metadata: any = {}) => {
        const duration = Date.now() - startTime;
        logger.info(`[LATENCY] ${name}: ${duration}ms`, { ...metadata, durationMs: duration });

        if (duration > 1000) {
            try {
                const admin = await import("firebase-admin");
                const db = admin.firestore();
                await db.collection('system_performance_logs').add({
                    type: 'HIGH_LATENCY',
                    name,
                    durationMs: duration,
                    ...metadata,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                // Silently fail to avoid loop
            }
        }
    },

    /**
     * trackFirestoreWrite
     * Special log to audit write volume.
     */
    trackWrite: (collection: string, operation: 'set' | 'update' | 'delete' | 'batch', metadata: any = {}) => {
        logger.debug(`[DB_WRITE] ${collection} | ${operation}`, metadata);
    }
};
