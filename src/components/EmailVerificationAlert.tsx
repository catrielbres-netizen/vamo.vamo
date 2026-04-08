'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { sendEmailVerification, getAuth } from 'firebase/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function EmailVerificationAlert() {
    const { user } = useUser();
    const { toast } = useToast();
    const router = useRouter();
    const [isResending, setIsResending] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    const performCheck = useCallback(async (isManual = false) => {
        if (!user || user.emailVerified) return;
        
        if (isManual) setIsChecking(true);
        try {
            await user.reload();
            if (user.emailVerified) {
                await user.getIdToken(true); // Force token refresh
                if (isManual) {
                    toast({ title: '¡Cuenta verificada!', description: 'Gracias por verificar tu email. Ya podés operar.' });
                } else {
                    toast({ title: '¡Email verificado!', description: 'Tu cuenta ha sido activada automáticamente.' });
                }
                // Force a hard refresh to re-evaluate eligibility across the app
                window.location.reload(); 
            } else if (isManual) {
                toast({ variant: 'destructive', title: 'Aún no verificado', description: 'No pudimos confirmar tu email. Revisá tu bandeja de entrada o Spam, y tocá el enlace.' });
            }
        } catch (error) {
            console.error('Error reloading user', error);
        } finally {
            if (isManual) setIsChecking(false);
        }
    }, [user, toast]);

    // Polling and Focus Listeners
    useEffect(() => {
        if (!user || user.emailVerified) return;

        // 1. Polling every 5 seconds
        const intervalId = setInterval(() => {
            performCheck(false);
        }, 5000);

        // 2. Focus and Visibility Listeners
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                performCheck(false);
            }
        };

        const handleFocus = () => {
            performCheck(false);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [user, performCheck]);

    // If user is not loaded, already verified, or a demo account, don't show the alert.
    if (!user || user.emailVerified || (user.email?.includes('demo_') && user.email?.endsWith('@vamo.com'))) return null;

    const handleResend = async () => {
        setIsResending(true);
        try {
            // Force reload to ensure the token is fresh and the user wasn't deleted
            await user.reload();
            const auth = getAuth();
            const activeUser = auth.currentUser || user;
            
            if (!activeUser) {
                throw new Error("No hay una sesión activa de Firebase Auth.");
            }

            await sendEmailVerification(activeUser);
            toast({ title: 'Email enviado', description: `Revisá la casilla ${activeUser.email} y también la de Spam.` });
        } catch (error: any) {
            console.error('Error sending verification email', error);
            if (error.code === 'auth/too-many-requests') {
                toast({ variant: 'destructive', title: 'Demasiados intentos', description: 'Firebase frenó el envío por spam. Esperá un par de minutos.' });
            } else if (error.code === 'auth/user-not-found' || error.code === 'auth/user-disabled') {
                toast({ variant: 'destructive', title: 'Sesión inválida', description: 'Tu cuenta parece haber sido eliminada o deshabilitada.' });
            } else {
                toast({ variant: 'destructive', title: 'Error de envío', description: error.message || 'No pudimos reenviar el correo.' });
            }
        } finally {
            setIsResending(false);
        }
    };

    return (
        <Alert variant="destructive" className="mb-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
            <VamoIcon name="alert-circle" className="h-5 w-5 text-red-600 dark:text-red-400" />
            <AlertTitle className="text-red-800 dark:text-red-300 font-bold">Verificá tu correo electrónico</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-400 mt-2">
                <p className="mb-3 text-sm">Tu cuenta está limitada. Por favor verificá tu identidad:</p>
                <ol className="list-decimal list-inside text-xs mb-4 space-y-1">
                    <li>Revisá tu casilla de correo ({user.email}).</li>
                    <li>Revisá la carpeta de Spam/No deseado por si acaso.</li>
                    <li>Tocá el enlace ahí recibido (actualizaremos tu estado automáticamente).</li>
                </ol>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button size="sm" onClick={() => performCheck(true)} disabled={isChecking} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-semibold flex-shrink-0">
                        {isChecking ? 'Actualizando...' : 'Ya verifiqué / Actualizar estado'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleResend} disabled={isResending} className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-100 dark:hover:bg-red-900 flex-shrink-0">
                        {isResending ? 'Enviando...' : 'Reenviar email'}
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    );
}

