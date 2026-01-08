// src/app/driver/payment/success/page.tsx
export const dynamic = 'force-dynamic';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// This page is now a static Server Component.
export default function PaymentSuccessPage() {
    return (
        <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
            <Card className="w-full text-center border-green-500">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2 text-green-600">
                        <VamoIcon name="check-circle" />
                        ¡Pago Realizado con Éxito!
                    </CardTitle>
                    <CardDescription>
                        Tu pago fue aprobado y se está procesando.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Tu saldo se actualizará en tu billetera en unos momentos.
                    </p>
                     <Button asChild>
                        <Link href="/driver/earnings">Volver a Mis Ganancias</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
