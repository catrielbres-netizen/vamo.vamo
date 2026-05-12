'use client';

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { sendEmailVerification } from 'firebase/auth';

export function EmailVerificationCard() {
    const { user, profile } = useUser();
    const { toast } = useToast();
    const [isVerifying, setIsVerifying] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    if (!user || user.emailVerified || (user.email?.includes('demo_') && user.email?.endsWith('@vamo.com')) || profile?.profileCompleted === false) {
        return null;
    }

    const handleSendVerification = async () => {
        setIsVerifying(true);
        try {
            await sendEmailVerification(user);
            toast({ 
                title: 'Email enviado', 
                description: `Revisá tu casilla ${user.email} (incluyendo Spam).` 
            });
        } catch (e: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Error', 
                description: e.message || 'No se pudo enviar el email.' 
            });
        } finally {
            setIsVerifying(false);
        }
    };

    const handleReloadAuth = async () => {
        setIsRefreshing(true);
        try {
            await user.reload();
            if (user.emailVerified) {
                toast({ title: '¡Email verificado!', description: 'Ya podés conectarte.' });
                // Note: The parent component will re-render and this component will disappear
            } else {
                toast({ 
                    variant: 'destructive', 
                    title: 'Aún no verificado', 
                    description: 'Revisá tu bandeja de entrada y hacé click en el link.' 
                });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="p-5 rounded-3xl bg-red-500/10 border border-red-500/20 space-y-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="mail" className="h-5 w-5 text-red-500" />
                </div>
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">Verificá tu email</h3>
                    <p className="text-xs text-zinc-400 mt-1">Verificá tu email para poder recibir viajes y cobrar.</p>
                </div>
            </div>
            
            <div className="flex flex-col gap-2">
                <Button 
                    size="sm" 
                    className="w-full h-10 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
                    onClick={handleSendVerification}
                    disabled={isVerifying}
                >
                    {isVerifying ? "Enviando..." : "Enviar email de verificación"}
                </Button>
                <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full h-10 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    onClick={handleReloadAuth}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? "Actualizando..." : "Ya verifiqué / actualizar"}
                </Button>
            </div>
        </div>
    );
}
