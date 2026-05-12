'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function CompleteProfileRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/driver/register');
    }, [router]);

    return <VamoFullScreenLoader label="Redirigiendo al registro..." />;
}
