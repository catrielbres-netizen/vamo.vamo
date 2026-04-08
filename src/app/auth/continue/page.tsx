'use client';

// src/app/auth/continue/page.tsx
// This page is the SINGLE source of truth for post-auth routing.
// It waits for the full auth state (user + profile + role) to be stable,
// then redirects to the correct destination. Login never needs to know about roles.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';

export default function AuthContinuePage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user, profile, loading, error } = useUser();

    useEffect(() => {
        // Step 1: Handle Errors immediately
        if (error) {
            console.error('🔀 [LOOP_DEBUG] AuthContinue - Fatal Error:', error.message);
            toast({ variant: 'destructive', title: 'Error de Sesión', description: 'No pudimos cargar tu perfil. Reintentando...' });
            router.replace('/login');
            return;
        }

        // Step 2: Wait for auth to initialize
        if (loading) {
            console.log('🔀 [LOOP_DEBUG] AuthContinue - Still loading auth/profile state...');
            return;
        }

        // Step 3: No session -> go back to login
        if (!user) {
            console.log('🔀 [LOOP_DEBUG] AuthContinue - No active session. Redirect -> /login');
            router.replace('/login');
            return;
        }

        // Step 4: Session exists but profile not yet ready
        const role = profile ? (profile as any).role : null;
        if (!profile || !role) {
            console.log('🔀 [LOOP_DEBUG] AuthContinue - Waiting for profile/role. profileExists:', !!profile, 'role:', role);
            
            // Rescue logic: if after 5 seconds we still have no profile/role, something is wrong
            const rescueTimer = setTimeout(() => {
                console.warn('🔀 [LOOP_DEBUG] AuthContinue - Profile resolution TIMEOUT. Redirect -> /login');
                router.replace('/login');
            }, 5000);
            
            return () => clearTimeout(rescueTimer); 
        }

        // Step 5: Full state ready — decide destination
        const validRoles = ['driver', 'passenger', 'admin', 'admin_municipal'];
        if (!validRoles.includes(role)) {
            console.error('🔀 [LOOP_DEBUG] AuthContinue - INVALID ROLE:', role);
            router.replace('/login');
            return; 
        }

        console.log('🔀 [LOOP_DEBUG] AuthContinue - RESOLVED. UID:', user.uid, 'Role:', role, 'ProfileCompleted:', profile.profileCompleted);

        let targetPath: string;

        if (!profile.profileCompleted) {
            targetPath = role === 'driver' ? '/driver/complete-profile' : '/dashboard/complete-profile';
            console.log('🔀 [LOOP_DEBUG] AuthContinue - Profile incomplete. Redirect ->', targetPath);
        } else {
            switch (role) {
                case 'driver':          targetPath = '/driver/rides'; break;
                case 'admin':           targetPath = '/admin/dashboard'; break;
                case 'admin_municipal': targetPath = '/municipal/dashboard'; break;
                case 'passenger':       targetPath = '/dashboard/ride'; break;
                default: 
                    // Should be covered by validRoles check above, but for safety:
                    router.replace('/login');
                    return;
            }
            console.log('🔀 [LOOP_DEBUG] AuthContinue - Profile complete. Redirect ->', targetPath);
        }

        // Delay the redirect slightly to ensure the UI message is seen and context is stable.
        const timer = setTimeout(() => {
            router.replace(targetPath);
        }, 800);
        return () => clearTimeout(timer);
    }, [user, profile, loading, error, router, toast]);

    // UI Logic for sequential messages
    let statusMessage = "Iniciando sesión...";
    if (loading) statusMessage = "Cargando estado...";
    else if (!profile) statusMessage = "Obteniendo tu perfil...";
    else if (!(profile as any).role) statusMessage = "Validando permisos...";
    else statusMessage = "Configurando tu panel...";

    // Always show a clean loader — this page never has visible content
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#121212]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-zinc-500 font-medium animate-pulse">{statusMessage}</p>
            </div>
        </div>
    );
}
