
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
        if (isNaN(numericAmount) || numericAmount < 1000) {
            toast({ 
                variant: 'destructive', 
                title: 'Monto Insuficiente', 
                description: 'El monto mínimo para solicitar un retiro es de $1.000.' 
            });
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
            const functions = getFunctions(undefined, 'us-central1');
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center backdrop-blur-xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Saldo disponible</p>
                <p className="text-3xl font-black text-white">{formatCurrency(withdrawableBalance)}</p>
            </div>
            
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="amount" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Monto a Retirar (Min $1.000)</Label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0"
                            className="h-14 pl-8 rounded-2xl bg-black/40 border-zinc-800 focus:border-indigo-500/50 transition-all font-bold text-lg"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="accountHolder" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Nombre del Titular</Label>
                    <Input
                        id="accountHolder"
                        type="text"
                        placeholder="Nombre completo tal cual figura en el banco"
                        className="h-12 rounded-2xl bg-black/20 border-zinc-800 focus:border-indigo-500/50"
                        value={accountHolder}
                        onChange={(e) => setAccountHolder(e.target.value)}
                        disabled={isLoading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="cbuOrAlias" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">CBU o Alias de Cuenta</Label>
                    <Textarea
                        id="cbuOrAlias"
                        placeholder="CBU de 22 dígitos o el Alias de tu billetera/banco"
                        className="rounded-2xl bg-black/20 border-zinc-800 focus:border-indigo-500/50 min-h-[80px]"
                        value={cbuOrAlias}
                        onChange={(e) => setCbuOrAlias(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
            </div>
            
            <DialogFooter className="!mt-8 flex flex-col gap-3">
                <Button 
                    variant="morphic" 
                    onClick={handleSubmit} 
                    disabled={isLoading || withdrawableBalance < 1000}
                    className="w-full h-14 rounded-2xl text-lg shadow-indigo-500/20"
                >
                    {isLoading ? (
                        <>
                            <VamoIcon name="loader" className="animate-spin mr-2" />
                            Procesando...
                        </>
                    ) : (
                        'Solicitar Retiro PRO'
                    )}
                </Button>
                <Button 
                    variant="ghost" 
                    onClick={onCancel} 
                    type="button" 
                    disabled={isLoading}
                    className="w-full h-12 rounded-2xl text-zinc-500 font-bold"
                >
                    Cancelar
                </Button>
            </DialogFooter>
        </div>
    );
}
