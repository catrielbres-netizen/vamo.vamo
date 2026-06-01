'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { Ride } from '@/lib/types';
import { cn } from '@/lib/utils';

export function MercadoPagoPaymentButton({ ride, amount }: { ride: Ride; amount: number }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    if (amount <= 0 || ride.paymentStatus === 'approved') {
        return null; // Nothing to pay or already paid
    }

    const isMp = ride.paymentMethod === 'automatic' || ride.paymentMethod === 'mercadopago' || ride.paymentMethod === 'auto';
    const isStartedOrFinished = ['in_progress', 'ongoing', 'completed', 'finished'].includes(ride.status);

    if (ride.paymentMethod === 'cash' || ride.paymentMethod === 'efectivo') {
        return null;
    }

    if (ride.paymentMethod === 'wallet' || ride.paymentMethod === 'vamo_wallet') {
        return null;
    }

    if (isMp && !isStartedOrFinished) {
        return (
            <div className="w-full bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl flex flex-col items-center text-center">
                <span className="text-[10px] font-black uppercase text-blue-400">Pago pendiente</span>
                <span className="text-[9px] text-zinc-500 font-medium mt-1">Pagarás con Mercado Pago cuando el viaje esté iniciado o finalizado.</span>
            </div>
        );
    }

    const handleVerify = async () => {
        if (!ride.id) return;
        setIsLoading(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const verifyPayment = httpsCallable<{rideId: string}, {status: string, payment_id?: string}>(functions, 'verifyRidePaymentV1');
            const result = await verifyPayment({ rideId: ride.id });
            
            if (result.data.status === 'approved') {
                toast({
                    title: "Pago confirmado",
                    description: "El pago se ha registrado correctamente.",
                });
            } else {
                toast({
                    title: "Aún pendiente",
                    description: "El pago todavía no se ha confirmado en Mercado Pago. Si ya pagaste, intentá en unos minutos.",
                });
            }
        } catch (error: any) {
            console.error("Verify Error:", error);
            toast({
                title: "Error al verificar pago",
                description: error.message || "Hubo un problema al verificar.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (ride.paymentStatus === 'pending' && ride.mpPreferenceId) {
        return (
            <div className="w-full bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl flex flex-col items-center gap-2">
                <span className="text-[10px] font-black uppercase text-blue-400">Pago pendiente</span>
                <span className="text-[9px] text-zinc-500 text-center leading-tight">Esperando confirmación de Mercado Pago...</span>
                <Button 
                    onClick={handleVerify}
                    disabled={isLoading}
                    variant="outline"
                    className="h-8 text-[10px] w-full font-bold uppercase tracking-widest bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
                >
                    {isLoading ? "Verificando..." : "Verificar Pago"}
                </Button>
            </div>
        );
    }

    const handlePay = async () => {
        if (!ride.id) return;
        
        setIsLoading(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const createPref = httpsCallable<{rideId: string}, {init_point: string, sandbox_init_point: string, checkout_url?: string}>(functions, 'createRidePaymentPreferenceV1');
            
            const result = await createPref({ rideId: ride.id });
            const data = result.data;

            const checkoutUrl = data?.checkout_url || data?.sandbox_init_point || data?.init_point;

            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                throw new Error("No se recibió el enlace de pago.");
            }
        } catch (error: any) {
            console.error("MP Error:", error);
            toast({
                title: "Error al generar pago",
                description: error.message || "Hubo un problema de conexión con Mercado Pago.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button 
            onClick={handlePay}
            disabled={isLoading}
            className={cn(
                "w-full h-14 rounded-2xl font-black uppercase tracking-widest text-white shadow-xl flex items-center justify-center gap-2",
                "bg-[#009EE3] hover:bg-[#008ACB]"
            )}
        >
            {isLoading ? (
                <VamoIcon name="loader" className="w-5 h-5 animate-spin" />
            ) : (
                <>
                    <VamoIcon name="credit-card" className="w-5 h-5" />
                    Pagar con Mercado Pago
                </>
            )}
        </Button>
    );
}
