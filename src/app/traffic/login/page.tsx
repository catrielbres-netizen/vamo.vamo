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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';

export default function TrafficLoginPage() {
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

            // Solo permitimos roles que tengan acceso a la gestión de tráfico
            const validTrafficRoles = ['admin', 'admin_municipal', 'traffic_municipal'];
            if (!validTrafficRoles.includes(userProfile.role)) {
                await auth.signOut();
                throw new Error('Acceso denegado. Esta cuenta no tiene permisos para el área de Tránsito.');
            }
            
            toast({ title: '¡Bienvenido Agente!', description: 'Accediendo al centro de control...' });
            router.replace('/traffic');

        } catch (error: any) {
            let description = 'Credenciales incorrectas o el usuario no existe.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El email o la contraseña son incorrectos.';
            } else {
                description = error.message;
            }
            toast({ variant: 'destructive', title: 'Error de acceso', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent">
            <Card className="max-w-md w-full border-white/5 bg-zinc-950/50 backdrop-blur-3xl shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700" />
                
                <CardHeader className="text-center pt-10 pb-6">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                        <VamoIcon name="shield-check" className="h-8 w-8 text-indigo-500" />
                    </div>
                    <CardTitle className="text-3xl font-black tracking-tighter italic uppercase">VamoTránsito</CardTitle>
                    <CardDescription className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-1">Control de Seguridad y Flota</CardDescription>
                </CardHeader>

                <CardContent className="px-8 pb-10 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Legajo / Email</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                placeholder="agente@transito.gov.ar" 
                                className="h-12 bg-black/50 border-white/10 rounded-xl focus:border-indigo-500/50 transition-all font-medium text-sm"
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                disabled={isSubmitting} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" title="Contraseña" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Contraseña</Label>                            
                            <Input 
                                id="password" 
                                type="password" 
                                className="h-12 bg-black/50 border-white/10 rounded-xl focus:border-indigo-500/50 transition-all font-medium text-sm"
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
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-xl shadow-indigo-600/10 transition-all active:scale-[0.98]"
                        >
                            {isSubmitting ? 'VERIFICANDO...' : 'ACCEDER AL CONTROL'}
                        </Button>
                        
                        <p className="text-center text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] pt-4">
                            SISTEMA DE SEGURIDAD VIAL VAMO PRO
                        </p>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
