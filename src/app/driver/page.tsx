// src/app/driver/page.tsx
'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This is a temporary redirect. The main driver content is now in /driver/rides
export default function DriverPageRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/driver/rides');
    }, [router]);

    return (
        <div className="container mx-auto p-4 text-center">
            <p>Redirigiendo...</p>
        </div>
    );
}
