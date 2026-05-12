import React, { Suspense } from 'react';
import RegisterPageClient from './RegisterPageClient';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#121212] flex items-center justify-center text-white">Cargando...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}
