'use client';

import React, { Suspense } from 'react';
import LoginPageClient from './LoginPageClient';
import { useSearchParams } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

function LoginParamsHandler() {
    const searchParams = useSearchParams();
    const role = searchParams.get('role');
    const fixedRole = role === 'driver' || role === 'passenger' ? role : undefined;

    return <LoginPageClient fixedRole={fixedRole} />;
}

export default function RootLoginPage() {
    return (
        <Suspense fallback={<VamoFullScreenLoader label="Cargando acceso..." />}>
            <LoginParamsHandler />
        </Suspense>
    );
}
