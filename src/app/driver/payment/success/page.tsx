// src/app/driver/payment/success/page.tsx
export const dynamic = "force-dynamic";

'use client';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';


export default function PaymentSuccessPage() {
    const router = useRouter();
    const { toast } = useToast();

    // Show a toast confirmation on this page as well
    useEffect(() => {
        toast({
            title: '✅ ¡Pago Aprobado!',
            description: 'Tu saldo se actualizará en breve.',
        });
    }, [toast]);


    const handleGoToEarnings = () => {
        router.push('/driver/earnings');
    };

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
                    <Button onClick={handleGoToEarnings}>Volver a Mis Ganancias</Button>
                </CardContent>
            </Card>
        </div>
    );
}
