'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Suspense } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { CURRENT_TERMS_VERSION } from "@/lib/legal-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ShieldCheck, Scale } from 'lucide-react';

function CompletePassengerProfileContent() {
    const { user, profile } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);

    // DEEP LINK / CAPTURA: Leer ref=CODE y campaign de la URL o del storage
    useEffect(() => {
        const refParam = searchParams.get('ref') || localStorage.getItem('vamo_captured_referral');
        const campaignParam = searchParams.get('campaign') || localStorage.getItem('vamo_captured_campaign');

        if (refParam && !referralCodeInput) {
            const code = refParam.toUpperCase().trim();
            setReferralCodeInput(code);
            
            const msg = campaignParam 
                ? `🎉 ¡Llegaste invitado por la campaña ${campaignParam}!` 
                : "🎉 ¡Llegaste invitado por un amigo!";

            toast({ 
                title: msg, 
                description: `Tu beneficio se activará automáticamente al completar tu primer viaje.`,
                duration: 5000
            });
        }
    }, [searchParams, toast, referralCodeInput]);

    useEffect(() => {
        if (profile) {
            if (profile.name) setName(profile.name);
            if (profile.surname) setSurname(profile.surname);
            if (profile.displayName) setDisplayName(profile.displayName);
            if (profile.phone) setPhone(profile.phone);
            if (profile.gender) setGender(profile.gender as any);
            if (profile.photoURL) setPhotoURL(profile.photoURL);
            
            // Auto-completar referido guardado en el paso anterior (login/signup)
            if (profile.referredByCode && !referralCodeInput) {
                setReferralCodeInput(profile.referredByCode);
            }
        }
    }, [profile, referralCodeInput]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // Validation
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Archivo inválido', description: 'Por favor, subí una imagen.' });
            return;
        }

        setIsUploading(true);
        try {
            const storage = getStorage();
            const storageRef = ref(storage, `profiles/${user.uid}/avatar_${Date.now()}`);
            
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            
            setPhotoURL(downloadURL);
            toast({ title: 'Foto cargada', description: 'Tu foto de perfil se actualizó correctamente.' });
        } catch (error) {
            console.error("Error uploading photo:", error);
            toast({ variant: 'destructive', title: 'Error de subida', description: 'No se pudo cargar la imagen.' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!name || !surname || !phone || !gender || !photoURL || !displayName) {
            toast({ 
                variant: 'destructive', 
                title: 'Campos requeridos', 
                description: 'Por favor, completá todos los datos obligatorios, incluyendo tu foto.' 
            });
            return;
        }

        if (!termsAccepted) {
            toast({ 
                variant: 'destructive', 
                title: 'Términos no aceptados', 
                description: 'Debés aceptar los términos y condiciones para continuar.' 
            });
            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        try {
            const functions = getFunctions(undefined, 'us-central1');
            const updateProfile = httpsCallable(functions, 'updateProfileV1');
            
            const normalizedPhone = phone.replace(/[\s\-\+()]/g, '');
            
            await updateProfile({
                name,
                surname,
                displayName,
                phone: normalizedPhone,
                gender,
                photoURL,
                profileCompleted: true,
                termsAccepted: true,
                termsVersion: CURRENT_TERMS_VERSION,
                termsAcceptedAt: new Date() // El wrapper de functions manejará el Timestamp de server si es necesario
            });

            // APLICAR REFERIDO SI EXISTE
            if (referralCodeInput.trim()) {
                const applyReferral = httpsCallable(functions, 'applyReferralCodeV1');
                const campaign = localStorage.getItem('vamo_captured_campaign');
                
                await applyReferral({ 
                    referralCode: referralCodeInput.trim(),
                    source: 'link',
                    campaign: campaign
                });
                
                localStorage.removeItem('vamo_captured_referral');
                localStorage.removeItem('vamo_captured_campaign');
            }
            
            toast({
                title: '¡Perfil PRO listo!',
                description: 'Bienvenido a VamO. Redirigiendo...',
            });

            router.replace('/dashboard/ride'); 
            
        } catch (error: any) {
            console.error("🔥 ERROR GUARDANDO PERFIL:", error);
            let errorMessage = error.message || 'Error al guardar.';
            if (error.code === 'already-exists') errorMessage = 'El teléfono ya está en uso.';
            
            setFormError(errorMessage);
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#121212] pt-12 pb-20 px-4">
            <div className="max-w-md mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="space-y-2 text-center">
                    <h1 className="text-4xl font-black text-white tracking-tighter">Completá tu Perfil</h1>
                    <p className="text-zinc-500 text-sm">Necesitamos estos datos para que tus viajes sean seguros y profesionales.</p>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="relative group">
                        <div className={cn(
                            "absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl transition-all duration-500 opacity-0 group-hover:opacity-100",
                            isUploading && "animate-pulse opacity-100"
                        )} />
                        
                        <Avatar className="h-32 w-32 border-4 border-zinc-900 shadow-2xl ring-2 ring-white/5 relative overflow-hidden">
                            <AvatarImage src={photoURL || ''} className="object-cover" />
                            <AvatarFallback className="bg-zinc-800 text-zinc-500 text-4xl font-bold">
                                {name ? name[0].toUpperCase() : <VamoIcon name="user" className="h-10 w-10 text-zinc-700" />}
                            </AvatarFallback>
                            
                            {isUploading && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <VamoIcon name="loader" className="h-8 w-8 text-white animate-spin" />
                                </div>
                            )}
                        </Avatar>

                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="absolute bottom-0 right-0 h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full border-4 border-zinc-900 flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90"
                        >
                            <VamoIcon name="camera" className="h-5 w-5" />
                        </button>
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                        accept="image/*" 
                    />
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Foto de perfil obligatoria</p>
                </div>

                <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 space-y-6">
                    {formError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500">
                            <VamoIcon name="alert-circle" className="h-4 w-4" />
                            <p className="text-xs font-medium">{formError}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Nombre</Label>
                            <Input 
                                placeholder="Juan" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Apellido</Label>
                            <Input 
                                placeholder="Pérez" 
                                value={surname} 
                                onChange={e => setSurname(e.target.value)} 
                                className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Nombre Visible (para viajes)</Label>
                        <Input 
                            placeholder="Juan P." 
                            value={displayName} 
                            onChange={e => setDisplayName(e.target.value)} 
                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                        />
                        <p className="text-[10px] text-zinc-600 px-1">Es el nombre que verá el conductor.</p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Teléfono (WhatsApp)</Label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">+54</div>
                            <Input 
                                type="tel" 
                                placeholder="2804123456" 
                                value={phone} 
                                onChange={e => setPhone(e.target.value)} 
                                className="h-12 pl-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Género</Label>
                        <Select value={gender} onValueChange={(val: any) => setGender(val)}>
                            <SelectTrigger className="h-12 bg-white/5 border-white/5 rounded-xl text-white focus:ring-indigo-500">
                                <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                <SelectItem value="male">Hombre</SelectItem>
                                <SelectItem value="female">Mujer</SelectItem>
                                <SelectItem value="other">Otro / Prefiero no decir</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">¿Te invitó alguien? (Opcional)</Label>
                        <Input 
                            placeholder="Ej: VAMO-A1B2" 
                            value={referralCodeInput} 
                            onChange={e => setReferralCodeInput(e.target.value.toUpperCase())} 
                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500 uppercase font-mono" 
                        />
                        <p className="text-[10px] text-zinc-600 px-1">Ingresá el código de tu amigo para que ambos ganen beneficios.</p>
                    </div>

                    <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 rounded-2xl border border-white/5 mx-1">
                        <div className="flex items-start gap-3">
                            <Checkbox 
                                id="terms" 
                                checked={termsAccepted} 
                                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                                className="mt-1 border-indigo-500/50 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="terms"
                                    className="text-[11px] font-medium text-zinc-400 cursor-pointer select-none"
                                >
                                    Acepto los <button onClick={(e) => { e.preventDefault(); setIsLegalModalOpen(true); }} className="text-indigo-400 hover:text-indigo-300 font-bold underline">Términos y Condiciones</button> de VamO PRO.
                                </label>
                                <p className="text-[9px] text-zinc-600 font-medium">Reconozco que VamO es un intermediario tecnológico y acepto el marco de asistencia económica.</p>
                            </div>
                        </div>
                    </div>

                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || isUploading || !termsAccepted}
                        className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/10 active:scale-[0.98]"
                    >
                        {isSubmitting ? <VamoIcon name="loader" className="h-6 w-6 animate-spin" /> : "Guardar y Empezar"}
                    </Button>
                </div>

                <Dialog open={isLegalModalOpen} onOpenChange={setIsLegalModalOpen}>
                    <DialogContent className="max-w-md h-[80vh] flex flex-col p-0 gap-0 sm:rounded-[2rem] overflow-hidden bg-zinc-900 border-zinc-800">
                        <DialogHeader className="p-6 border-b border-white/5 shrink-0 text-left">
                            <div className="flex items-center gap-3 mb-1">
                                <Scale className="h-5 w-5 text-indigo-400" />
                                <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">Condiciones VamO PRO</DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-zinc-500 italic">Versión {CURRENT_TERMS_VERSION} | Acuerdo Global</DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto p-6 text-sm text-zinc-300 space-y-6 leading-relaxed">
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">1. Naturaleza Jurídica</h3>
                                <p>VamO PRO es exclusivamente una plataforma de software que facilita la conexión entre pasajeros y conductores independientes. No es una empresa de transporte ni de seguros.</p>
                            </section>
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">2. Fondo de Asistencia (F.A.P.)</h3>
                                <p>Para viajes Express (particulares), VamO ofrece una asistencia económica limitada por reintegro. No constituye una póliza de seguro tradicional.</p>
                            </section>
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">3. Comportamiento y Seguridad</h3>
                                <p>El uso de la plataforma implica el respeto mutuo. Cualquier incidente debe ser reportado en un plazo máximo de 24 horas para ser elegible para asistencia.</p>
                            </section>
                        </div>
                        <div className="p-6 bg-zinc-900/80 backdrop-blur-md border-t border-white/5 shrink-0">
                            <Button 
                                onClick={() => { setTermsAccepted(true); setIsLegalModalOpen(false); }}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 rounded-xl"
                            >
                                Entiendo y Acepto
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <p className="text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                    Tus datos están protegidos por VamO PRO Engine
                </p>
            </div>
        </main>
    );
}

export default function CompletePassengerProfilePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#121212] flex items-center justify-center text-white font-bold">Cargando...</div>}>
            <CompletePassengerProfileContent />
        </Suspense>
    );
}
