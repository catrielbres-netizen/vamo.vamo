'use client';

import { useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

/**
 * Route: /r/[code]
 * Captures referral code and redirects to login.
 */
export default function ReferralPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params?.code as string;

  useEffect(() => {
    if (code) {
      console.log('🔗 [REFERRAL] Captured code:', code);
      // We use 'referralCode' as requested by the user for consistency
      localStorage.setItem('referralCode', code.toUpperCase().trim());
      // Also keep vamo_captured_referral for backward compatibility if needed by other components
      localStorage.setItem('vamo_captured_referral', code.toUpperCase().trim());
      
      // Capture explicit city overrides if provided
      const explicitCity = searchParams.get('cityKey') || searchParams.get('registrationCityKey') || searchParams.get('city');
      if (explicitCity) {
        console.log('🔗 [REFERRAL] Captured explicit cityKey:', explicitCity);
        localStorage.setItem('vamo_explicit_city_key', explicitCity.toLowerCase().trim());
      }
    }
    router.replace('/login');
  }, [code, router, searchParams]);

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">VamO: Validando Invitación...</p>
      </div>
    </div>
  );
}
