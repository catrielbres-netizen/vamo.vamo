import React, { Suspense } from 'react';
import LoginPageClient from '../../login/LoginPageClient';

export default function DriverLoginPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <LoginPageClient fixedRole="driver" />
    </Suspense>
  );
}
