
import { Suspense } from 'react';
import SuccessClient from './SuccessClient';

export const dynamic = 'force-dynamic';

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
        <p>Cargando información del pago...</p>
      </div>
    }>
      <SuccessClient />
    </Suspense>
  );
}
