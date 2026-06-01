'use client';

import React, { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function TaxiStandLoginPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const { isInitializing } = useFirebase();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

    const handleSignIn = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        // Inline Validation
        const newErrors: { email?: string; password?: string } = {};
        if (!email) newErrors.email = 'El email es obligatorio.';
        if (!password) newErrors.password = 'La contraseña es obligatoria.';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        if (!auth || !firestore) return;

        setIsSubmitting(true);
        setErrors({});

        try {
            console.log(`[STATION_LOGIN_ATTEMPT] Email: ${email}`);
            if (auth.currentUser) await signOut(auth);
            
            const { user: signedUser } = await signInWithEmailAndPassword(auth, email, password);
            
            // Fetch profile and check role
            const userDoc = await getDoc(doc(firestore, 'users', signedUser.uid));
            if (userDoc.exists()) {
                const profile = userDoc.data();
                if (profile.role === 'station_operator') {
                    console.log(`[STATION_LOGIN_SUCCESS] Operator ${signedUser.uid} authenticated successfully.`);
                    toast({
                        title: 'Acceso exitoso',
                        description: `Bienvenido operador ${profile.name || '—'} de la parada ${profile.stationName || '—'}.`
                    });
                    router.push('/taxi-stand/dashboard');
                    return;
                } else {
                    console.warn(`[STATION_LOGIN_REJECT] User ${signedUser.uid} has role ${profile.role}, not station_operator. Aborting session.`);
                    await signOut(auth);
                    toast({
                        variant: 'destructive',
                        title: 'Acceso denegado',
                        description: 'Esta cuenta no posee el rol de operador de parada.'
                    });
                }
            } else {
                console.warn(`[STATION_LOGIN_REJECT] Profile missing for ${signedUser.uid}.`);
                await signOut(auth);
                toast({
                    variant: 'destructive',
                    title: 'Perfil no encontrado',
                    description: 'No se pudo encontrar tu perfil de operador.'
                });
            }
        } catch (error: any) {
            console.error("[STATION_LOGIN_FAILED]", error);
            if (auth) await signOut(auth);

            let desc = 'Credenciales incorrectas.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                desc = 'Email o contraseña incorrectos.';
            }
            toast({ variant: 'destructive', title: 'Error de acceso', description: desc });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isInitializing || isSubmitting) {
        return <VamoFullScreenLoader label={isSubmitting ? "Autenticando..." : "Cargando..."} />;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] p-6 w-full overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950 -z-10" />

            <div className="w-full max-w-[420px] flex flex-col items-center animate-in fade-in zoom-in duration-500">
                
                <div className="w-full flex justify-center mb-10">
                    <div className="w-[140px]">
                        <VamoLogo variant="login" priority />
                    </div>
                </div>
                
                <Card className="w-full bg-zinc-900 border-white/5 shadow-2xl rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                    
                    <CardHeader className="text-center pb-6">
                        <div className="mx-auto w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-2">
                            <VamoIcon name="car" className="h-6 w-6 text-indigo-400" />
                        </div>
                        <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">
                            Operador de Parada
                        </CardTitle>
                        <CardDescription className="text-zinc-500 font-medium">Ingresá tus credenciales de parada digital</CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email</Label>
                                <Input 
                                    id="email" 
                                    type="email" 
                                    placeholder="operador@parada.com"
                                    value={email} 
                                    onChange={e => { setEmail(e.target.value); setErrors(prev => ({...prev, email: undefined})); }}
                                    className={errors.email ? 'h-12 border-red-500 bg-red-500/10 rounded-xl text-white' : 'h-12 bg-white/5 border-white/10 rounded-xl text-white focus:ring-indigo-500'}
                                />
                                {errors.email && <p className="text-red-500 text-[10px] font-black uppercase tracking-tighter ml-2 mt-1">{errors.email}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" title="Contraseña" className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Contraseña</Label>
                                <Input 
                                    id="password" 
                                    type="password" 
                                    value={password} 
                                    onChange={e => { setPassword(e.target.value); setErrors(prev => ({...prev, password: undefined})); }}
                                    className={errors.password ? 'h-12 border-red-500 bg-red-500/10 rounded-xl text-white' : 'h-12 bg-white/5 border-white/10 rounded-xl text-white focus:ring-indigo-500'}
                                />
                                {errors.password && <p className="text-red-500 text-[10px] font-black uppercase tracking-tighter ml-2 mt-1">{errors.password}</p>}
                            </div>

                            <Button 
                                type="submit"
                                disabled={isSubmitting} 
                                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-xl shadow-xl shadow-indigo-600/10 active:scale-[0.98] transition-all mt-2"
                            >
                                {isSubmitting ? <VamoIcon name="loader" className="animate-spin" /> : 'ACCEDER AL PANEL'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                
                <p className="mt-8 text-[10px] font-black text-zinc-700 uppercase tracking-[0.2em]">
                    VamO Paradas Digitales Engine v1.0
                </p>
            </div>
        </div>
    );
}
