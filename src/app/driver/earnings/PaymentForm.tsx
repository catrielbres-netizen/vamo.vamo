
'use client';

import React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VamoIcon } from '@/components/VamoIcon';
import { useFirebaseApp } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

const amountPresets = [5000, 10000, 15000, 20000];

export function PaymentForm({ onCancel }: { onCancel: () => void }) {
    const firebaseApp = useFirebaseApp();
    const { toast } = useToast();
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handlePayment = async () => {
        if (!firebaseApp) {
            toast({ variant: 'destructive', title: 'Error', description: 'La app de Firebase no está inicializada.' });
            return;
        }
        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount < 500) {
            toast({ variant: 'destructive', title: 'Monto Inválido', description: 'Por favor, ingresá un monto de al menos $500.' });
            return;
        }

        setIsLoading(true);

        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            // El nombre 'createPaymentPreferenceV4' debe coincidir exactamente con el exportado en functions/src/index.ts
            const createPreference = httpsCallable(functions, 'createPaymentPreferenceV4');
            const result = await createPreference({ amount: numericAmount });
            
            const data = result.data as { init_point?: string, error?: string };

            if (data.error) {
                throw new Error(data.error);
            }

            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                throw new Error('No se recibió el punto de inicio de pago de MercadoPago.');
            }

        } catch (error: any) {
            console.error('Error creating preference via callable function:', error);
            toast({
                variant: 'destructive',
                title: 'Error al iniciar el pago',
                description: error.message || 'No se pudo comunicar con el servidor de pagos. Intentá de nuevo.',
            });
            setIsLoading(false);
        }
    };


    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                {amountPresets.map((preset) => (
                    <Button
                        key={preset}
                        variant="outline"
                        type="button"
                        onClick={() => setAmount(String(preset))}
                    >
                        ${preset.toLocaleString('es-AR')}
                    </Button>
                ))}
            </div>
            <div className="space-y-2">
                <Label htmlFor="amount">Otro Monto (ARS)</Label>
                <Input
                    id="amount"
                    name="amount"
                    type="number"
                    placeholder="Monto mínimo: $500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min="500" 
                    disabled={isLoading}
                />
            </div>
            
            <DialogFooter className="!mt-6 flex-col gap-2 sm:flex-col sm:space-x-0">
                <Button onClick={handlePayment} disabled={isLoading || !amount} className="w-full">
                    {isLoading ? (
                        <>
                            <VamoIcon name="loader" className="animate-spin mr-2" />
                            Procesando...
                        </>
                    ) : (
                        <>
                            <VamoIcon name="credit-card" className="mr-2" />
                            Pagar con Mercado Pago
                        </>
                    )}
                </Button>
                <Button variant="outline" onClick={onCancel} type="button" disabled={isLoading}>Cancelar</Button>
            </DialogFooter>
        </div>
    );
}
