'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function TaxiStandRootPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/taxi-stand/dashboard');
    }, [router]);

    return <VamoFullScreenLoader label="Cargando panel de paradas..." />;
}
