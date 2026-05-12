'use client';

import React from 'react';
import DriverRegisterClient from '@/components/driver/DriverRegisterClient';
import { PWAInstallationGate } from '@/components/auth/PWAInstallationGate';

export default function RegisterPage() {
  return (
    <PWAInstallationGate>
        <DriverRegisterClient />
    </PWAInstallationGate>
  );
}
