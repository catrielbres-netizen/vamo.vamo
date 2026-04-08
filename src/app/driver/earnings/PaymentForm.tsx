
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
import { usePromotions } from '@/hooks/usePromotions';

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
            const functions = getFunctions(undefined, 'us-central1');
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


    const { promotions: topupPromos, isLoading: loadingPromos } = usePromotions('topup');

    const getBonusForAmount = (amt: number) => {
        // Find the best promo (already sorted by priority from backend)
        const eligible = topupPromos.filter(p => !p.conditions.minAmount || amt >= p.conditions.minAmount);
        if (eligible.length === 0) return null;
        
        const p = eligible[0];
        if (p.reward.type === 'fixed') return p.reward.value;
        const reward = Math.floor(amt * (p.reward.value / 100));
        return p.reward.cap ? Math.min(reward, p.reward.cap) : reward;
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                {amountPresets.map((preset) => {
                    const bonus = getBonusForAmount(preset);
                    return (
                        <Button
                            key={preset}
                            variant="outline"
                            type="button"
                            className="h-16 flex flex-col items-center justify-center relative overflow-hidden group border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 rounded-2xl transition-all"
                            onClick={() => setAmount(String(preset))}
                        >
                            <span className="text-lg font-black">${preset.toLocaleString('es-AR')}</span>
                            {bonus && !loadingPromos && (
                                <span className="text-[10px] font-black text-green-500 uppercase tracking-tighter">
                                    + ${bonus.toLocaleString('es-AR')} REGALO
                                </span>
                            )}
                            {bonus && (
                                <div className="absolute top-0 right-0 w-8 h-8 bg-green-500/10 rounded-bl-2xl flex items-center justify-center">
                                    <VamoIcon name="gift" className="w-3 h-3 text-green-500" />
                                </div>
                            )}
                        </Button>
                    );
                })}
            </div>
            <div className="space-y-2">
                <Label htmlFor="amount" className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Otro Monto (ARS)</Label>
                <div className="relative">
                    <Input
                        id="amount"
                        name="amount"
                        type="number"
                        placeholder="Monto mínimo: $500"
                        className="bg-zinc-900 border-zinc-800 h-14 rounded-2xl pl-10 text-lg font-bold"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        min="500" 
                        disabled={isLoading}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</div>
                    
                    {amount && Number(amount) >= 500 && (
                        <div className="mt-2 pl-1 animate-in fade-in slide-in-from-top-2">
                            {(() => {
                                const bonus = getBonusForAmount(Number(amount));
                                if (bonus) return (
                                    <p className="text-xs font-bold text-green-500 flex items-center gap-1.5">
                                        <VamoIcon name="sparkles" className="w-3 h-3" />
                                        ¡Tenés un bono de regalo de ${bonus.toLocaleString('es-AR')}!
                                    </p>
                                );
                                return null;
                            })()}
                        </div>
                    )}
                </div>
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
