/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { CURRENT_TERMS_VERSION } from '@/lib/legal-config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Scale, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TermsGuard: Intercepta usuarios que no han aceptado la versión vigente de T&C.
 * Bloquea la navegación con un modal forzoso hasta que el usuario acepte.
 */
export function TermsGuard({ children, forced, onClose }: { children?: React.ReactNode, forced?: boolean, onClose?: () => void }) {
    const { user, profile, loading } = useUser();
    const { toast } = useToast();
    const [isAccepting, setIsAccepting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Determinar si falta aceptación (validación reactiva unificada)
    const needsAcceptance = !loading && !!profile && profile.role !== 'superadmin' && (
        !(profile.termsAccepted || profile.driverTermsAccepted || profile.acceptedDriverTerms) || 
        profile.termsVersion !== CURRENT_TERMS_VERSION
    );

    useEffect(() => {
        if (needsAcceptance) {
            console.log("[PASSENGER_TERMS_REQUIRED] Current version:", profile?.termsVersion, "Expected:", CURRENT_TERMS_VERSION);
        }
    }, [needsAcceptance, profile?.termsVersion]);

    useEffect(() => {
        if (forced || needsAcceptance) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [forced, needsAcceptance]);

    const handleAccept = async () => {
        if (!user) return;
        
        setIsAccepting(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const updateProfile = httpsCallable(functions, 'updateProfileV1');
            
            await updateProfile({
                termsAccepted: true,
                driverTermsAccepted: true,
                acceptedDriverTerms: true, // Legacy compatibility
                termsAcceptedAt: new Date(),
                termsVersion: CURRENT_TERMS_VERSION,
                legalAccepted: true
            });

            console.log("[PASSENGER_TERMS_ACCEPTED] Terms version", CURRENT_TERMS_VERSION, "accepted by", user.uid);
            
            toast({
                title: 'Términos aceptados',
                description: `Actualizado a la versión ${CURRENT_TERMS_VERSION}.`,
            });
            
            console.log("[PASSENGER_TERMS_REDIRECT_DECISION] Closing modal. Staying on current page.");
            setIsOpen(false);
        } catch (error: any) {
            console.error("🔥 [TC_GUARD_ERROR]:", error);
            toast({
                variant: 'destructive',
                title: 'Error al actualizar',
                description: 'No pudimos registrar tu aceptación. Reintentá en unos segundos.',
            });
        } finally {
            setIsAccepting(false);
        }
    };

    // Si está cargando o no hay perfil, dejar pasar (el layout manejará el resto)
    if (loading || !profile) return <>{children}</>;

    return (
        <>
            {children}
            
            <Dialog open={isOpen} onOpenChange={(open) => {
                if (!open && onClose) onClose();
            }}>
                <DialogContent 
                    className="max-w-md w-[95vw] max-h-[85vh] flex flex-col gap-0 sm:rounded-[2.5rem] overflow-hidden bg-zinc-950 border-white/5 shadow-2xl p-0"
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    {/* Header Premium */}
                    <DialogHeader className="p-8 border-b border-white/5 bg-zinc-900/50 shrink-0 text-left relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Scale className="h-32 w-32 text-indigo-500 -mr-12 -mt-12 rotate-12" />
                        </div>
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
                                    <Scale className="h-5 w-5 text-indigo-400" />
                                </div>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Acuerdo Legal VamO PRO</span>
                            </div>
                            <div>
                                <DialogTitle className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                                    Términos y Condiciones
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500 font-medium">
                                    Versión {CURRENT_TERMS_VERSION} | Actualización Obligatoria {new Date().getFullYear()}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Contenido Legal Scrollable */}
                    <div className="flex-1 overflow-y-auto p-8 text-sm text-zinc-400 space-y-8 leading-relaxed custom-scrollbar">
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-zinc-300 font-medium">
                                Hemos actualizado nuestro marco legal para darte mayor respaldo. Al continuar usando VamO PRO, aceptas estas condiciones que rigen para todos tus viajes futuros.
                            </p>
                        </div>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                                <h3 className="font-black text-white text-[11px] uppercase tracking-widest">1. Rol de la Plataforma e Intermediación</h3>
                            </div>
                            <p className="text-xs">VamO actúa exclusivamente como un <span className="text-white font-bold">intermediario tecnológico</span> que conecta conductores independientes con pasajeros. No existiendo relación laboral ni societaria, VamO no presta servicios de transporte ni garantiza la idoneidad o seguridad absoluta de los terceros prestadores.</p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                                <h3 className="font-black text-white text-[11px] uppercase tracking-widest">2. Fondo de Asistencia (F.A.P.)</h3>
                            </div>
                            <p className="text-xs">Para la modalidad Express, el usuario acepta el funcionamiento del <span className="text-white font-bold">Fondo de Asistencia VamO</span>. Este constituye un beneficio <span className="text-white font-bold">discrecional, limitado y sujeto a evaluación</span> interna. No implica un contrato de seguro, póliza técnica ni obligación automática de pago ante incidentes.</p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                                <h3 className="font-black text-white text-[11px] uppercase tracking-widest">3. Taxis y Remises</h3>
                            </div>
                            <p className="text-xs">Los viajes realizados en unidades de Taxi o Remis habilitados operan bajo sus propios seguros obligatorios de pasajeros. VamO actúa como gestor de despacho y pago para estas unidades, pero la responsabilidad del transporte recae en el permisionario.</p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                                <h3 className="font-black text-white text-[11px] uppercase tracking-widest">4. Privacidad y Datos</h3>
                            </div>
                            <p className="text-xs">Consientes el tratamiento de tus datos de geolocalización, contacto e historial operativo para garantizar la seguridad del servicio y la transparencia en la liquidación de viajes.</p>
                        </section>

                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 text-zinc-600">
                                <AlertCircle className="h-3 w-3" />
                                <p className="text-[10px] italic">Este acuerdo es vinculante y rige en la jurisdicción de la Provincia de Chubut, Argentina.</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer con Acción Fijo */}
                    <div className="p-6 sm:p-8 pb-10 bg-zinc-900 border-t border-white/5 shrink-0 flex flex-col gap-4">
                        <div className="flex items-start gap-3 px-2">
                            <div className="h-4 w-4 rounded border border-indigo-500/50 bg-indigo-500/10 flex items-center justify-center mt-0.5 shrink-0">
                                <VamoIcon name="check" className="h-2 w-2 text-indigo-400" />
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-tight">
                                Al hacer clic en "Acepto", confirmás que has leído y comprendido los términos detallados arriba y su validez para el uso continuo de la plataforma.
                            </p>
                        </div>
                        <Button 
                            onClick={handleAccept}
                            disabled={isAccepting}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-[0.98] mb-2 sm:mb-0"
                        >
                            {isAccepting ? (
                                <VamoIcon name="loader" className="h-6 w-6 animate-spin" />
                            ) : (
                                "Acepto y Continuar"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </>
    );
}
