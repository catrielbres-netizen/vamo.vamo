'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { sendEmailVerification, signOut, getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function EmailVerificationGate({ children }: { children: React.ReactNode }) {
    const { user, profile, loading } = useUser();
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
                toast({ title: '¡Email verificado!', description: 'Ya podés acceder a todas las funciones de VamO.' });
                // Force a hard refresh to re-evaluate eligibility across the app
                window.location.reload(); 
            } else if (isManual) {
                toast({ 
                    variant: 'destructive', 
                    title: 'Aún no verificado', 
                    description: 'No pudimos confirmar tu email. Revisá tu bandeja de entrada o Spam.' 
                });
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

        const intervalId = setInterval(() => {
            performCheck(false);
        }, 5000);

        const handleFocus = () => performCheck(false);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [user, performCheck]);

    if (loading) return null; // Let the layout handle the initial loader
    if (!user) return <>{children}</>; // No user, no gate (handled by auth guard)
    
    // IF user is verified, a demo account, or ALREADY APPROVED by admin/muni, show children
    if (user.emailVerified || 
        (user.email?.includes('demo_') && user.email?.endsWith('@vamo.com')) ||
        profile?.approved === true) {
        return <>{children}</>;
    }

    const handleResend = async () => {
        setIsResending(true);
        try {
            await sendEmailVerification(user);
            toast({ title: 'Email enviado', description: `Revisá la casilla ${user.email}.` });
        } catch (error: any) {
            if (error.code === 'auth/too-many-requests') {
                toast({ variant: 'destructive', title: 'Demasiados intentos', description: 'Por favor, esperá unos minutos.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar el correo.' });
            }
        } finally {
            setIsResending(false);
        }
    };

    const handleLogout = async () => {
        const auth = getAuth();
        await signOut(auth);
        router.push('/login');
    };

    // BLOCKING UI
    return (
        <div className="fixed inset-0 z-[100] bg-[#121212] flex items-center justify-center p-6 text-center">
            <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-20" />
                    <div className="relative flex items-center justify-center w-full h-full bg-indigo-500/10 rounded-full border border-indigo-500/30">
                        <VamoIcon name="mail" className="h-10 w-10 text-indigo-500" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-black text-white tracking-tighter">Verificá tu email</h1>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Enviamos un enlace de confirmación a <span className="text-white font-bold">{user.email}</span>.<br />
                        Necesitás verificar tu cuenta para empezar a viajar.
                    </p>
                </div>

                <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5 text-left space-y-3">
                    <div className="flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-[10px] font-bold shrink-0 mt-0.5">1</div>
                        <p className="text-zinc-400 text-xs">Buscá el correo de <span className="text-zinc-200">VamO</span> en tu bandeja de entrada.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-[10px] font-bold shrink-0 mt-0.5">2</div>
                        <p className="text-zinc-400 text-xs">Si no lo ves, revisá la carpeta de <span className="text-zinc-200">Spam</span>.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-[10px] font-bold shrink-0 mt-0.5">3</div>
                        <p className="text-zinc-400 text-xs">Hace clic en el enlace para activar tu cuenta.</p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <Button 
                        onClick={() => performCheck(true)} 
                        disabled={isChecking}
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
                    >
                        {isChecking ? <VamoIcon name="loader" className="h-4 w-4 animate-spin" /> : "Ya verifiqué / Actualizar estado"}
                    </Button>
                    
                    <div className="flex gap-3">
                        <Button 
                            variant="outline" 
                            onClick={handleResend} 
                            disabled={isResending}
                            className="flex-1 h-12 border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                        >
                            {isResending ? "Enviando..." : "Reenviar email"}
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={handleLogout}
                            className="flex-1 h-12 text-zinc-500 hover:text-white"
                        >
                            Cerrar Sesión
                        </Button>
                    </div>
                </div>

                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">VamO PRO Security Engine</p>
            </div>
        </div>
    );
}
