'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function MunicipalRootPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/municipal/dashboard');
    }, [router]);

    return <VamoFullScreenLoader label="Cargando panel municipal..." />;
}
