'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { CURRENT_DRIVER_TERMS_VERSION } from '@/lib/legal-config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Scale, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function DriverLegalGuard({ children, forced, onClose }: { children?: React.ReactNode, forced?: boolean, onClose?: () => void }) {
    const { user, profile, loading } = useUser();
    const { toast } = useToast();
    const [isAccepting, setIsAccepting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const [fullName, setFullName] = useState('');
    const [dni, setDni] = useState('');
    const [checked, setChecked] = useState(false);

    const needsAcceptance = !loading && !!profile && profile.role === 'driver' && (
        !profile.legal?.driverTermsAccepted || 
        profile.legal?.driverTermsVersion !== CURRENT_DRIVER_TERMS_VERSION
    );

    useEffect(() => {
        if (forced || needsAcceptance) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [forced, needsAcceptance]);

    const handleAccept = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !checked || !fullName.trim() || !dni.trim()) return;
        
        setIsAccepting(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const acceptTerms = httpsCallable(functions, 'acceptDriverTermsV1');
            
            await acceptTerms({
                contractVersion: CURRENT_DRIVER_TERMS_VERSION,
                cityKey: profile?.cityKey || 'unknown',
                signatureText: 'Acepto',
                fullName: fullName.trim(),
                dni: dni.trim()
            });

            toast({
                title: '✅ Contrato Aceptado',
                description: `Has firmado digitalmente la versión ${CURRENT_DRIVER_TERMS_VERSION}.`,
            });
            
            setIsOpen(false);
            if (onClose) onClose();
        } catch (error: any) {
            console.error("🔥 [DRIVER_TC_GUARD_ERROR]:", error);
            toast({
                variant: 'destructive',
                title: 'Error al firmar',
                description: error.message || 'No pudimos registrar tu aceptación. Reintentá en unos segundos.',
            });
        } finally {
            setIsAccepting(false);
        }
    };

    if (loading || !profile || profile.role !== 'driver') return <>{children}</>;

    return (
        <>
            {children}
            
            <Dialog open={isOpen} onOpenChange={(open) => {
                if (!open && onClose) onClose();
            }}>
                <DialogContent 
                    className="max-w-md w-[95vw] max-h-[90vh] flex flex-col gap-0 sm:rounded-[2.5rem] overflow-hidden bg-zinc-950 border-white/5 shadow-2xl p-0"
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader className="p-6 sm:p-8 border-b border-white/5 bg-zinc-900/50 shrink-0 text-left relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Scale className="h-32 w-32 text-indigo-500 -mr-12 -mt-12 rotate-12" />
                        </div>
                        <div className="relative z-10 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
                                    <Scale className="h-5 w-5 text-indigo-400" />
                                </div>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Acuerdo Legal VamO PRO</span>
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                                    Contrato de Conductor
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500 font-medium">
                                    Versión {CURRENT_DRIVER_TERMS_VERSION} | Obligatorio
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 text-sm text-zinc-400 space-y-8 leading-relaxed custom-scrollbar">
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-zinc-300 font-medium">
                                VamO actúa como plataforma tecnológica de intermediación entre usuarios pasajeros y conductores independientes.
                            </p>
                        </div>

                        <section className="space-y-3">
                            <h3 className="font-black text-white text-[11px] uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-indigo-500" />1. Rol de la Plataforma</h3>
                            <p className="text-xs">VamO no es empleador, transportista, titular del vehículo ni aseguradora. Su función es proveer la tecnología para la intermediación y registro.</p>
                        </section>
                        
                        <section className="space-y-3">
                            <h3 className="font-black text-white text-[11px] uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-indigo-500" />2. Independencia y Responsabilidad</h3>
                            <p className="text-xs">El conductor es un proveedor independiente. Es el responsable directo de la prestación material del servicio, del estado del vehículo, la conducción segura, y del cumplimiento estricto de habilitaciones, seguros obligatorios, licencia de conducir, documentación y normativa de tránsito local.</p>
                        </section>

                        <section className="space-y-3">
                            <h3 className="font-black text-white text-[11px] uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-indigo-500" />3. Suspensión</h3>
                            <p className="text-xs">VamO podrá suspender o inhabilitar la cuenta por motivos de seguridad, presentación de documentación falsa o vencida, y reiterados incumplimientos o reportes de la comunidad.</p>
                        </section>
                        
                        {profile?.cityKey === 'rio_gallegos' && (
                            <section className="space-y-3 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                <h3 className="font-black text-amber-500 text-[11px] uppercase tracking-widest flex items-center gap-2"><AlertCircle className="h-3 w-3" />Aviso: Río Gallegos</h3>
                                <p className="text-xs text-amber-200/70">Río Gallegos se encuentra en etapa de reclutamiento previo al lanzamiento. La aceptación y eventual aprobación documental no implican inicio inmediato de viajes. VamO informará cuando la ciudad quede activa para operar.</p>
                            </section>
                        )}
                    </div>

                    <form onSubmit={handleAccept} className="p-6 sm:p-8 bg-zinc-900 border-t border-white/5 shrink-0 flex flex-col gap-4">
                        <div className="space-y-4 mb-2">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Aclaración (Nombre Completo)</Label>
                                <Input 
                                    required 
                                    value={fullName} 
                                    onChange={e => setFullName(e.target.value)} 
                                    placeholder="Ej. Juan Pérez" 
                                    className="bg-zinc-950 border-white/10 text-white h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">DNI</Label>
                                <Input 
                                    required 
                                    value={dni} 
                                    onChange={e => setDni(e.target.value)} 
                                    placeholder="Sin puntos" 
                                    type="number"
                                    className="bg-zinc-950 border-white/10 text-white h-12"
                                />
                            </div>
                            <label className="flex items-start gap-3 pt-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    required
                                    checked={checked} 
                                    onChange={e => setChecked(e.target.checked)} 
                                    className="mt-1 h-4 w-4 rounded border-white/10 bg-zinc-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" 
                                />
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-300">
                                    Leí y acepto los términos del conductor. Reconozco que mi IP y datos quedarán registrados como firma electrónica bajo la Ley vigente.
                                </span>
                            </label>
                        </div>
                        <Button 
                            type="submit"
                            disabled={isAccepting || !checked || !fullName || !dni}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-[0.98]"
                        >
                            {isAccepting ? (
                                <VamoIcon name="loader" className="h-6 w-6 animate-spin" />
                            ) : (
                                "Aceptar y continuar"
                            )}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
            `}</style>
        </>
    );
}
