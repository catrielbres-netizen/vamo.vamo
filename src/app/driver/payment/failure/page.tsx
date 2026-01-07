
// src/app/driver/payment/failure/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export default function PaymentFailurePage() {
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        toast({
            variant: 'destructive',
            title: '❌ Pago Rechazado',
            description: 'La transacción no pudo ser completada.',
        });
    }, [toast]);


    const handleRetry = () => {
        router.push('/driver/earnings');
    };

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
                    <Button onClick={handleRetry} variant="destructive">
                        Volver a Ganancias e Intentar de Nuevo
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
