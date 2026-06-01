import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { Role } from '@/lib/types';

export type TelemetryEventType = 
    | 'ride_lifecycle' 
    | 'matching' 
    | 'passenger_activity' 
    | 'driver_activity' 
    | 'system_error' 
    | 'revenue' 
    | 'security'
    | 'municipal_operation';

export interface TelemetryEvent {
    type: TelemetryEventType;
    eventName: string;
    userId?: string | null;
    role?: Role | null;
    cityKey?: string | null;
    rideId?: string | null;
    metadata?: Record<string, any>;
    appVersion?: string;
    platform?: 'web' | 'ios' | 'android' | 'pwa';
}

/**
 * [VamO TELEMETRY HARDENING]
 * Centralized service for tracking high-fidelity operational events with cost control.
 */
export class TelemetryService {
    private db: Firestore;
    private version = '2.1.0';
    private throttleMap: Map<string, number> = new Map();

    constructor(db: Firestore) {
        this.db = db;
    }

    /**
     * Tracks an event with built-in throttling and safety.
     * @param event The event data
     * @param throttleMs Optional throttling duration in ms
     */
    async trackEvent(event: TelemetryEvent, throttleMs: number = 0) {
        const now = Date.now();
        const throttleKey = `${event.type}:${event.eventName}:${event.userId || 'anon'}`;

        if (throttleMs > 0) {
            const lastTracked = this.throttleMap.get(throttleKey) || 0;
            if (now - lastTracked < throttleMs) {
                // Throttled: Skip write to Firestore to save costs
                return;
            }
            this.throttleMap.set(throttleKey, now);
        }

        // Fire-and-forget pattern: Don't block the UI for telemetry
        this.persistEvent(event).catch(err => {
            console.error("[TELEMETRY_SILENT_FAIL]", err);
        });
    }

    private async persistEvent(event: TelemetryEvent) {
        try {
            // [VamO PRO] Structured logging for immediate production audit
            console.log(`[TELEMETRY_${event.type.toUpperCase()}] ${event.eventName}`, {
                uid: event.userId,
                city: event.cityKey,
                ...event.metadata
            });

            // Calculate TTL (30 days by default for raw events)
            const ttlDays = 30;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + ttlDays);

            // Persist to Firestore for deep analytics
            await addDoc(collection(this.db, 'telemetry_events'), {
                ...event,
                createdAt: serverTimestamp(),
                expiresAt, // Firestore TTL field
                appVersion: this.version,
                platform: this.getPlatform()
            });
        } catch (error) {
            // Don't crash the app if telemetry fails, but log it
            console.error("[TELEMETRY_ERROR] Failed to track event:", error);
        }
    }

    private getPlatform(): 'web' | 'pwa' {
        if (typeof window !== 'undefined') {
            const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
            return isPWA ? 'pwa' : 'web';
        }
        return 'web';
    }

    // --- Specialized Tracking Helpers ---

    async trackRideLifecycle(rideId: string, status: string, metadata?: any) {
        // Critical events are not throttled
        return this.trackEvent({
            type: 'ride_lifecycle',
            eventName: `ride_${status}`,
            rideId,
            metadata
        });
    }

    async trackMatching(rideId: string, eventName: string, metadata?: any) {
        // Matching events are high-frequency but critical for funnel analysis
        // We apply a short 5s throttle for same-event name to avoid race condition duplicates
        return this.trackEvent({
            type: 'matching',
            eventName: `matching_${eventName}`,
            rideId,
            metadata
        }, 5000);
    }

    async trackPresence(role: Role, userId: string, cityKey: string, isOnline: boolean) {
        // Heartbeat/Presence is throttled to 60s to avoid exploding costs
        return this.trackEvent({
            type: role === 'driver' ? 'driver_activity' : 'passenger_activity',
            eventName: isOnline ? 'went_online' : 'went_offline',
            userId,
            role,
            cityKey,
            metadata: { isOnline }
        }, 60000);
    }

    async trackError(eventName: string, error: any, metadata?: any) {
        // Errors are never throttled but are kept for 90 days instead of 30
        const now = Date.now();
        try {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 90);

            await addDoc(collection(this.db, 'telemetry_events'), {
                type: 'system_error',
                eventName,
                createdAt: serverTimestamp(),
                expiresAt,
                metadata: {
                    message: error?.message || String(error),
                    stack: error?.stack,
                    ...metadata
                },
                appVersion: this.version,
                platform: this.getPlatform()
            });
        } catch (e) {
            console.error("[TELEMETRY_FATAL_ERROR]", e);
        }
    }
}

// Telemetry module entry point. 
// Note: TelemetryProvider and useTelemetry are exported from ./TelemetryProvider 
// to avoid circular dependencies with TelemetryService.
