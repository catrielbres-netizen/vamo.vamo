// src/app/page.tsx

export const dynamic = "force-dynamic";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { useUser } from '@/firebase';
import Providers from './providers';

// This is the Client Component that contains all the client-side logic and hooks.
function HomePageContent() {
  'use client';
  
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
            router.replace('/admin');
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
      }
      // If user exists but profile is still loading, do nothing and wait for the next render.
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


// This is the Server Component entry point for the page.
export default function Home() {
  return (
    <Providers>
      <HomePageContent />
    </Providers>
  );
}