
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';
import { useUser } from '@/firebase';

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useUser();

  useEffect(() => {
    // Wait until the authentication state is fully loaded
    if (loading) return;

    if (user) {
      // User is authenticated
      if (profile) {
        // User has a profile, redirect based on role
        switch (profile.role) {
          case 'admin':
            router.replace('/admin/dashboard');
            break;
          case 'driver':
            router.replace('/driver');
            break;
          case 'passenger':
          default:
            // Default to passenger dashboard if role is passenger or undefined
            router.replace('/dashboard');
            break;
        }
      } else {
        // This is a crucial state: user is authenticated but has no profile data yet.
        // This might happen for a moment after sign-up. 
        // We stay on the loading screen and let the next state change handle it.
        // If it persists, it could indicate an error during profile creation.
        // For now, we do nothing and wait for the 'profile' to be populated.
      }
    } else {
      // No user is authenticated, redirect to the login page
      router.replace('/login');
    }
  }, [user, profile, loading, router]);

  // Universal loading screen while determining the user's destination.
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon name="car" className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}
