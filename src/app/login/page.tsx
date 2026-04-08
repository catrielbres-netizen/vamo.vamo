import React, { Suspense } from 'react';
import LoginPageClient from './LoginPageClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <LoginPageClient fixedRole="passenger" />
    </Suspense>
  );
}
