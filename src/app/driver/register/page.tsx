import DriverRegisterClient from '@/components/driver/DriverRegisterClient';
import { Suspense } from 'react';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Cargando formulario...</div>}>
        <DriverRegisterClient />
    </Suspense>
  );
}
