'use client';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentPendingPage() {
    const router = useRouter();

    const handleGoToEarnings = () => {
        router.push('/driver/earnings');
    };

    return (
        <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
            <Card className="w-full text-center border-blue-500">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2 text-blue-600">
                        <Hourglass />
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
                    <Button onClick={handleGoToEarnings} variant="outline">
                        Volver a Mis Ganancias
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
