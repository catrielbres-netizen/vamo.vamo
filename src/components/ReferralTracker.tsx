'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ReferralTrackerContent() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const ref = searchParams.get('ref') || searchParams.get('r');
        if (ref) {
            const existing = localStorage.getItem('referralCode');
            // No sobrescribir si ya existe uno válido
            if (!existing) {
                console.log('🔗 [REFERRAL] Global capture:', ref);
                const cleanRef = ref.toUpperCase().trim();
                localStorage.setItem('referralCode', cleanRef);
                localStorage.setItem('vamo_captured_referral', cleanRef);
            } else {
                console.log('🔗 [REFERRAL] Already have a code, skipping:', existing);
            }
        }
    }, [searchParams]);

    return null;
}

export default function ReferralTracker() {
    return (
        <Suspense fallback={null}>
            <ReferralTrackerContent />
        </Suspense>
    );
}
