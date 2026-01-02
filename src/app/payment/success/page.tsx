// src/app/payment/success/page.tsx
'use client';
import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function PaymentSuccessPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const { toast } = useToast();

    const summaryId = searchParams.get('summary_id');
    const paymentStatus = searchParams.get('status');

    useEffect(() => {
        if (summaryId && paymentStatus === 'approved' && firestore) {
            const summaryRef = doc(firestore, 'driver_summaries', summaryId);
            
            setDoc(summaryRef, {
                status: 'paid',
                updatedAt: Timestamp.now(),
            }, { merge: true }).then(() => {
                toast({
                    title: '¡Pago Aprobado!',
                    description: 'Tu comisión ha sido pagada y tu cuenta semanal reiniciada.',
                });
            }).catch(error => {
                 console.error("Error updating summary status:", error);
                 toast({
                    variant: 'destructive',
                    title: 'Error al actualizar tu cuenta',
                    description: 'Tu pago fue aprobado, pero no pudimos actualizar tu cuenta. Por favor, contactá a soporte.',
                });
            });
        }
    }, [summaryId, paymentStatus, firestore, toast]);

    const handleGoToEarnings = () => {
        router.push('/driver/earnings');
    };

    if (!summaryId || paymentStatus !== 'approved') {
        return (
            <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
                 <Card className="w-full text-center border-yellow-500">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2 text-yellow-600">
                            <AlertTriangle />
                            Estado de Pago Incierto
                        </CardTitle>
                        <CardDescription>
                            No pudimos confirmar el estado de tu pago automáticamente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Si el pago fue debitado, por favor contactá a soporte.
                        </p>
                        <Button onClick={handleGoToEarnings}>Volver a Ganancias</Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-md p-4 flex justify-center items-center min-h-screen">
            <Card className="w-full text-center border-green-500">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2 text-green-600">
                        <CheckCircle />
                        ¡Pago Realizado con Éxito!
                    </CardTitle>
                    <CardDescription>
                        Tu comisión semanal fue pagada correctamente.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Tu cuenta ha sido actualizada. Ya podés ver tu resumen semanal reiniciado.
                    </p>
                    <Button onClick={handleGoToEarnings}>Volver a Ganancias</Button>
                </CardContent>
            </Card>
        </div>
    );
}
