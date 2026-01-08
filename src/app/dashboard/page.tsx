'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This is a temporary redirect. The main passenger content is now in /dashboard/ride
export default function DashboardRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/ride');
    }, [router]);

    return (
        <div className="container mx-auto p-4 text-center">
            <p>Redirigiendo...</p>
        </div>
    );
}
