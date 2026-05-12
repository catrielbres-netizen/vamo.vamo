
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

// Utility functions copied from handlers.ts (simplified for the script)
function haversineDistance(coords1: { lat: number; lng: number; }, coords2: { lat: number; lng: number; }): number {
    if (!coords1 || !coords2) return Infinity;
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function repairSettlement(rideId: string) {
    console.log(`Starting REPAIR for ride ${rideId}...`);
    const rideRef = db.collection('rides').doc(rideId);
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) throw new Error("Ride not found");
    const rideData = rideSnap.data() as any;

    const driverId = rideData.driverId;
    const passengerId = rideData.passengerId;
    const ownerId = rideData.vehicleOwnerId || driverId;
    const cityKey = rideData.cityKey || 'rawson';

    const driverRef = db.collection('users').doc(driverId);
    const ownerRef = db.collection('users').doc(ownerId);
    const passengerRef = db.collection('users').doc(passengerId);
    const walletRef = db.collection('wallets').doc(passengerId);

    const driverSnap = await driverRef.get();
    const ownerData = (await ownerRef.get()).data() as any;
    const walletSnap = await walletRef.get();

    // 1. Calculate Settlement (Minimal version for repair)
    // We'll use the estimated total since it's already there and the ride is finished.
    const totalFare = rideData.pricing?.originalTotal || rideData.pricing?.estimated?.total || 1500;
    const commissionRate = rideData.cityKey === 'rawson' ? 0.12 : 0.10;
    const commissionAmount = Math.floor(totalFare * commissionRate);
    const municipalFee = Math.floor(totalFare * 0.02);

    console.log(`Calculated Fare: ${totalFare}, Commission: ${commissionAmount}`);

    await db.runTransaction(async (tx) => {
        // [VamO PRO] All reads first
        const txRideSnap = await tx.get(rideRef);
        const txWalletSnap = await tx.get(walletRef);
        const txOwnerSnap = await tx.get(ownerRef);

        const currentBalance = txOwnerSnap.data()?.currentBalance || 0;

        // Create completedRide object
        const completedRide = {
            totalFare,
            commissionAmount,
            municipalFee,
            calculatedAt: Timestamp.now(),
            distanceMeters: 0, // Placeholder for repair
            durationSeconds: 0,
            waitingSeconds: 0,
            pricingVersion: 1,
            calculationSource: 'manual_repair_script'
        };

        // Writes
        tx.update(rideRef, {
            status: 'completed',
            completedRide,
            settledAt: FieldValue.serverTimestamp(),
            settlementError: FieldValue.delete()
        });

        tx.update(ownerRef, {
            currentBalance: FieldValue.increment(-commissionAmount),
            updatedAt: FieldValue.serverTimestamp()
        });

        // Simple wallet update for passenger
        if (txWalletSnap.exists) {
            tx.update(walletRef, {
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        // Clear active ride for both
        tx.update(driverRef, { activeRideId: null });
        tx.update(passengerRef, { activeRideId: null });
    });

    console.log(`Ride ${rideId} REPAIRED successfully.`);
}

repairSettlement('IILa7vzq1fY2VVqSPC2K').catch(console.error);
