// src/lib/server/firestore.ts
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { Ride } from '@/lib/types';

let app: App;
let db: Firestore;

// This service account is automatically provided by App Hosting.
// It has admin privileges to your Firebase project.
if (getApps().length === 0) {
    app = initializeApp();
    db = getFirestore(app);
} else {
    app = getApps()[0];
    db = getFirestore(app);
}


/**
 * Fetches the most recent completed rides for a given driver.
 * @param driverId The UID of the driver.
 * @param count The number of rides to fetch.
 * @returns A promise that resolves to an array of Ride objects.
 */
export async function getRecentFinishedRidesForDriver(driverId: string, count: number): Promise<Ride[]> {
    const ridesRef = db.collection('rides');
    const q = ridesRef
        .where('driverId', '==', driverId)
        .where('status', '==', 'finished')
        .orderBy('createdAt', 'desc')
        .limit(count);

    const snapshot = await q.get();
    
    if (snapshot.empty) {
        return [];
    }

    // Convert Firestore Timestamps to a format that can be serialized
    const rides = snapshot.docs.map(doc => {
        const data = doc.data() as Ride;
        return {
            ...data,
            createdAt: (data.createdAt as any).toDate().toISOString(),
            updatedAt: (data.updatedAt as any).toDate().toISOString(),
            finishedAt: data.finishedAt ? (data.finishedAt as any).toDate().toISOString() : null,
            pauseStartedAt: data.pauseStartedAt ? (data.pauseStartedAt as any).toDate().toISOString() : null,
            pauseHistory: (data.pauseHistory || []).map(p => ({
                ...p,
                started: (p.started as any).toDate().toISOString(),
                ended: (p.ended as any).toDate().toISOString(),
            })),
        } as Ride;
    });

    return rides;
}

/**
 * Updates a ride document in Firestore to mark it as suspicious.
 * @param rideId The ID of the ride to update.
 * @param reason The reason the ride was flagged.
 */
export async function flagRideAsSuspicious(rideId: string, reason: string): Promise<void> {
    const rideRef = db.collection('rides').doc(rideId);
    await rideRef.update({
        audited: false, // Mark as NOT audited, so it appears in the admin queue
        auditComment: reason,
        updatedAt: Timestamp.now(),
    });
}
