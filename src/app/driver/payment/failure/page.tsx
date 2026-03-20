'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// This page is now a static Server Component.
export default function PaymentFailurePage() {
    return (
        <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
            <Card className="w-full text-center border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                        <VamoIcon name="x-circle" />
                        Pago Rechazado
                    </CardTitle>
                    <CardDescription>
                        La transacción no pudo ser completada.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Mercado Pago rechazó el pago. Por favor, intentá con otro medio de pago o revisá los datos de tu tarjeta.
                    </p>
                    <Button asChild variant="destructive">
                        <Link href="/driver/earnings">Volver a Ganancias e Intentar de Nuevo</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
