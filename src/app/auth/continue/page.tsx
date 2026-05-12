'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirebase } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

/**
 * [VamO SECURITY] Identity Repair & Routing Page
 * 
 * This page is the "safety net" for the authentication flow.
 * It ensures that every authenticated user has a valid Firestore profile
 * and is routed to the correct destination (Dashboard or Onboarding).
 */
export default function AuthContinuePage() {
    const router = useRouter();
    const { user, profile, loading } = useUser();
    const { services } = useFirebase();

    useEffect(() => {
        if (loading) return;

        // 1. Unauthenticated -> Login
        if (!user) {
            console.warn("[AUTH_CONTINUE] No user found. Redirecting to login...");
            router.replace('/login');
            return;
        }

        const resolveRouting = async () => {
            try {
                // 2. Profile missing -> Call Repair
                if (!profile) {
                    console.log("[AUTH_CONTINUE] Profile missing. Triggering repair...");
                    const functions = getFunctions(undefined, 'us-central1');
                    const repairProfile = httpsCallable(functions, 'repairUserProfileV1');
                    await repairProfile();
                    
                    // Wait for Firestore propagation
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    // Reload the page to pick up the new profile
                    window.location.reload();
                    return;
                }

                // 3. Routing based on status and role
                console.log(`[AUTH_CONTINUE] Profile resolved. Role: ${profile.role}, Status: ${profile.registrationStatus}`);

                if (profile.role === 'admin') {
                    router.replace('/admin');
                    return;
                }

                if (profile.registrationStatus !== 'active') {
                    console.warn(`[AUTH_CONTINUE] Incomplete registration (${profile.registrationStatus}). Routing to onboarding...`);
                    if (profile.role === 'driver') {
                        router.replace('/driver/register');
                    } else {
                        router.replace('/dashboard/complete-profile');
                    }
                } else {
                    console.log("[AUTH_CONTINUE] Status active. Routing to dashboard...");
                    if (profile.role === 'driver') {
                        router.replace('/driver');
                    } else {
                        router.replace('/dashboard');
                    }
                }

            } catch (err) {
                console.error("[AUTH_CONTINUE] Critical error during resolution:", err);
                // Fallback to home/login to avoid infinite loop
                router.replace('/login');
            }
        };

        resolveRouting();
    }, [user, profile, loading, router]);

    return (
        <VamoFullScreenLoader label="Sincronizando identidad..." />
    );
}
