'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function LoginPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/traffic/login');
  }, [router]);

  return <VamoFullScreenLoader label="Redirigiendo al Acceso de Tránsito..." />;
}
