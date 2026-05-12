'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function LoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login/conductor');
  }, [router]);

  return <VamoFullScreenLoader label="Redirigiendo..." />;
}
