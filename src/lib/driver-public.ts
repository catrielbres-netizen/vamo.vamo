import { UserProfile } from './types';

/**
 * Sanitizes and syncs a driver's profile to the public_driver_profiles collection.
 * [VamO PRO] Neutralized: This is now handled automatically by Cloud Functions
 * (syncPublicProfileOnUserUpdate and syncPublicProfileOnMuniUpdate) to ensure 
 * security and avoid permission errors in the frontend.
 */
export async function syncPublicDriverProfile(firestore: any, driverId: string) {
    // [VamO PRO] If you are seeing "Error syncing profile" in console, you have an old version of this file.
    // This new version is a NO-OP to prevent 'Missing or insufficient permissions' errors.
    console.log(`[VamO PRO] [SYNC_PUBLIC] Skipping client-side sync for ${driverId}. Backend will handle this.`);
    return;
}
