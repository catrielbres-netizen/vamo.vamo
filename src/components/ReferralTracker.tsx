'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * ReferralTracker Component
 * 
 * Captures the 'ref' query parameter from the URL and persists it in localStorage.
 * This ensures that if a user clicks a referral link, the code is remembered
 * even if they navigate away or complete the login/registration later.
 */
function ReferralTrackerContent() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const ref = searchParams.get('ref');
        const campaign = searchParams.get('campaign');

        const existingRef = localStorage.getItem('vamo_captured_referral');
        const existingCampaign = localStorage.getItem('vamo_captured_campaign');

        if (ref && !existingRef) {
            console.log('🎁 [REFERRAL_TRACKER] Captured referral code:', ref);
            localStorage.setItem('vamo_captured_referral', ref.toUpperCase().trim());
        }

        if (campaign && !existingCampaign) {
            console.log('📢 [REFERRAL_TRACKER] Captured campaign:', campaign);
            localStorage.setItem('vamo_captured_campaign', campaign.trim());
        }
    }, [searchParams]);

    return null; // This component doesn't render anything
}

export function ReferralTracker() {
    return (
        <Suspense fallback={null}>
            <ReferralTrackerContent />
        </Suspense>
    );
}
