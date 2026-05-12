'use client';

import React from 'react';
import { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { signInWithEmailAndPassword, Auth, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';

export default function MunicipalLoginPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de configuración', description: 'El servicio de autenticación no está disponible.' });
            return;
        }

        const searchParams = new URLSearchParams(window.location.search);
        const redirect = searchParams.get('redirect');
        const isInvitationFlow = redirect && redirect.includes('onboarding');

        setIsSubmitting(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Check user role
            const userRef = doc(firestore, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                throw new Error('Perfil no encontrado.');
            }

            const userProfile = userSnap.data() as UserProfile;

            // SECURITY EXCEPTION:
            // If the user is in an onboarding flow (invitation), we allow them to log in 
            // even if they don't have the role yet (they will receive it after onboarding).
            const validMuniRoles = ['admin', 'superadmin', 'admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal'];
            if (!validMuniRoles.includes(userProfile.role) && !isInvitationFlow) {
                await auth.signOut();
                throw new Error('Acceso denegado. Esta cuenta no tiene permisos municipales.');
            }
            
            toast({ title: '¡Bienvenido!', description: 'Accediendo...' });
            
            if (redirect) {
                router.replace(redirect);
            } else {
                router.replace('/municipal/dashboard');
            }

        } catch (error: any) {
            let description = 'Credenciales incorrectas o el usuario no existe.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El email o la contraseña son incorrectos.';
            } else {
                description = error.message;
            }
            toast({ variant: 'destructive', title: 'Error de inicio de sesión', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent">
            <Card className="max-w-md w-full border-white/5 bg-zinc-900/50 backdrop-blur-xl shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600" />
                
                <CardHeader className="text-center pt-10 pb-6">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                        <VamoIcon name="building" className="h-8 w-8 text-indigo-500" />
                    </div>
                    <CardTitle className="text-3xl font-black tracking-tighter italic">VamoMuni</CardTitle>
                    <CardDescription className="text-zinc-500 font-medium">Portal de Gestión Municipal</CardDescription>
                </CardHeader>

                <CardContent className="px-8 pb-10 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Email Oficial</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                placeholder="municipio@email.gov.ar" 
                                className="h-12 bg-black/50 border-white/10 rounded-xl focus:border-indigo-500/50 transition-all font-medium"
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                disabled={isSubmitting} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" title="Contraseña" className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Contraseña</Label>                            
                            <Input 
                                id="password" 
                                type="password" 
                                className="h-12 bg-black/50 border-white/10 rounded-xl focus:border-indigo-500/50 transition-all font-medium"
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <Button 
                            onClick={handleLogin} 
                            disabled={isSubmitting || !auth} 
                            className="w-full h-14 bg-white hover:bg-zinc-100 text-black font-black text-lg rounded-xl shadow-xl transition-all active:scale-[0.98]"
                        >
                            {isSubmitting ? 'VERIFICANDO...' : 'INICIAR SESIÓN'}
                        </Button>
                        
                        <div className="text-center pt-4">
                            <p className="text-zinc-500 text-sm">
                                ¿No tiene una cuenta oficial? <br/>
                                <button 
                                    onClick={() => router.push(`/municipal/register?redirect=${encodeURIComponent(new URLSearchParams(window.location.search).get('redirect') || '')}`)}
                                    className="text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-4 mt-2"
                                >
                                    Abrir registro municipal
                                </button>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
