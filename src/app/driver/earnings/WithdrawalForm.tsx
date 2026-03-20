
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VamoIcon } from '@/components/VamoIcon';
import { useFirebaseApp } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

export function WithdrawalForm({ withdrawableBalance, onCancel, onSuccess }: { withdrawableBalance: number, onCancel: () => void, onSuccess: () => void }) {
    const firebaseApp = useFirebaseApp();
    const { toast } = useToast();
    const [amount, setAmount] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [cbuOrAlias, setCbuOrAlias] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!firebaseApp) {
            toast({ variant: 'destructive', title: 'Error', description: 'La app de Firebase no está inicializada.' });
            return;
        }
        
        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            toast({ variant: 'destructive', title: 'Monto Inválido', description: 'Ingresá un monto mayor a cero.' });
            return;
        }

        if (numericAmount > withdrawableBalance) {
             toast({ variant: 'destructive', title: 'Saldo Insuficiente', description: `No podés retirar más de tu saldo retirable de ${formatCurrency(withdrawableBalance)}.` });
            return;
        }

        if (!accountHolder.trim() || !cbuOrAlias.trim()) {
            toast({ variant: 'destructive', title: 'Datos Incompletos', description: 'Por favor, completá todos los datos bancarios.' });
            return;
        }

        setIsLoading(true);

        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const requestWithdrawal = httpsCallable(functions, 'requestWithdrawalV1');
            await requestWithdrawal({
                amount: numericAmount,
                bankInfo: {
                    accountHolder,
                    cbuOrAlias,
                },
            });
            
            toast({
                title: 'Solicitud Enviada',
                description: 'Tu solicitud de retiro fue enviada. Será procesada por un administrador.',
            });
            onSuccess();
        } catch (error: any) {
            console.error('Error creating withdrawal request:', error);
            toast({
                variant: 'destructive',
                title: 'Error al solicitar el retiro',
                description: error.message || 'No se pudo procesar tu solicitud. Intenta de nuevo.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Saldo disponible para retirar</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(withdrawableBalance)}</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="amount">Monto a Retirar (ARS)</Label>
                <Input
                    id="amount"
                    type="number"
                    placeholder="Ej: 5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isLoading}
                />
            </div>
             <div className="space-y-2">
                <Label htmlFor="accountHolder">Nombre del Titular de la Cuenta</Label>
                <Input
                    id="accountHolder"
                    type="text"
                    placeholder="Tu nombre completo"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    disabled={isLoading}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="cbuOrAlias">CBU o Alias</Label>
                <Textarea
                    id="cbuOrAlias"
                    placeholder="Ingresá tu CBU de 22 dígitos o tu Alias"
                    value={cbuOrAlias}
                    onChange={(e) => setCbuOrAlias(e.target.value)}
                    disabled={isLoading}
                />
            </div>
            
            <DialogFooter className="!mt-6 flex-col gap-2 sm:flex-col sm:space-x-0">
                <Button onClick={handleSubmit} disabled={isLoading || withdrawableBalance <= 0}>
                    {isLoading ? (
                        <>
                            <VamoIcon name="loader" className="animate-spin mr-2" />
                            Enviando Solicitud...
                        </>
                    ) : (
                        'Solicitar Retiro'
                    )}
                </Button>
                <Button variant="outline" onClick={onCancel} type="button" disabled={isLoading}>Cancelar</Button>
            </DialogFooter>
        </div>
    );
}
