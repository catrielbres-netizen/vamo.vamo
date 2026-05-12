'use client';

import React from 'react';
import { AuthShell } from '@/features/auth/AuthShell';
import { MunicipalLoginForm } from '@/features/auth/MunicipalLoginForm';

export default function LoginPage() {
  return (
    <AuthShell 
      title="Portal Municipal" 
      subtitle="Acceso restringido para la administración y control de transporte público."
    >
      <MunicipalLoginForm />
    </AuthShell>
  );
}
