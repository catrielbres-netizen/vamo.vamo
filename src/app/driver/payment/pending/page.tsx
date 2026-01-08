'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// This page is now a static Server Component.
export default function PaymentPendingPage() {
    return (
        <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
            <Card className="w-full text-center border-blue-500">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2 text-blue-600">
                        <VamoIcon name="hourglass" />
                        Pago Pendiente
                    </CardTitle>
                    <CardDescription>
                        Tu pago está siendo procesado por Mercado Pago.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Generalmente, esto se aprueba en instantes. Te notificaremos cuando se acredite. Podés cerrar esta ventana.
                    </p>
                    <Button asChild variant="outline">
                         <Link href="/driver/earnings">Volver a Mis Ganancias</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
