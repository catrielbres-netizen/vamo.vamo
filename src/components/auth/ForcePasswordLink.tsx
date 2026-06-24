'use client';

import React, { useState } from 'react';
import { useFirebase } from '@/firebase';
import { updatePassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { VamoLogo } from '@/components/branding/VamoLogo';

interface ForcePasswordLinkProps {
    onComplete: () => void;
}

export function ForcePasswordLink({ onComplete }: ForcePasswordLinkProps) {
    const { auth } = useFirebase();
    const { toast } = useToast();
    const user = auth?.currentUser;

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!user || !user.email) {
            return toast({ variant: 'destructive', title: 'Error', description: 'Usuario no autenticado o sin email.' });
        }

        if (!password || !confirmPassword) {
            return toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor completá ambos campos.' });
        }

        if (password !== confirmPassword) {
            return toast({ variant: 'destructive', title: 'Contraseñas no coinciden', description: 'Asegurate de escribir la misma contraseña.' });
        }

        if (password.length < 6) {
            return toast({ variant: 'destructive', title: 'Contraseña débil', description: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        setIsSubmitting(true);
        try {
            // In Firebase, to add a password to an existing federated account, we use updatePassword
            await updatePassword(user, password);
            
            toast({ title: '¡Seguridad configurada!', description: 'Contraseña creada exitosamente.' });
            
            // Proceed to the next step
            onComplete();
        } catch (error: any) {
            console.error('Password Update Error:', error);
            let desc = error.message;
            if (error.code === 'auth/requires-recent-login') desc = 'Por seguridad, necesitás volver a iniciar sesión para cambiar la contraseña.';
            toast({ variant: 'destructive', title: 'Error al configurar', description: desc });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4 flex flex-col items-center">
                    <VamoLogo variant="login" className="mx-auto mb-4" />
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">
                            Mayor <span className="text-indigo-500">Seguridad</span>
                        </h1>
                        <p className="text-zinc-500 font-medium tracking-wide">Creá una contraseña para futuros ingresos</p>
                    </div>
                </div>

                <Card className="border-white/5 bg-zinc-900/40 backdrop-blur-xl shadow-2xl rounded-[2.5rem] overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-white">Último paso de seguridad</CardTitle>
                        <CardDescription className="text-zinc-500 italic">
                            Iniciaste sesión con Google, pero para garantizar tu acceso si no tenés Google a mano, necesitamos que configures una contraseña de VamO.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Nueva Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="******" 
                                        value={password} onChange={e => setPassword(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Confirmar Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="******" 
                                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit" disabled={isSubmitting}
                                className="w-full h-14 mt-4 rounded-2xl text-lg font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                            >
                                {isSubmitting ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : 'Guardar y Continuar'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
