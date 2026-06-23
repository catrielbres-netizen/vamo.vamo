'use client';

import React, { Suspense } from 'react';
import DriverRegisterClient from '@/components/driver/DriverRegisterClient';
import { PWAInstallationGate } from '@/components/auth/PWAInstallationGate';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Cargando formulario...</div>}>
      <PWAInstallationGate>
          <DriverRegisterClient />
      </PWAInstallationGate>
    </Suspense>
  );
}
