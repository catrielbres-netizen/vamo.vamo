'use client';

import React from 'react';
import { AuthShell } from '@/features/auth/AuthShell';
import { TrafficLoginForm } from '@/features/auth/TrafficLoginForm';

export default function LoginPage() {
  return (
    <AuthShell 
      title="Acceso Tránsito" 
      subtitle="Centro operativo de control vial y monitoreo de flota en tiempo real."
    >
      <TrafficLoginForm />
    </AuthShell>
  );
}
