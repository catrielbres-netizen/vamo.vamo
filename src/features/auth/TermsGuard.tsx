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
import { PassengerSpecificTerms, LiabilityPolicyText, PrivacyPolicyText, CancellationPolicyText, VerificationPolicyText, SuspensionPolicyText, ScoringPolicyText } from '@/components/legal/LegalTexts';

/**
 * TermsGuard: Intercepta usuarios que no han aceptado la versión vigente de T&C.
 * Bloquea la navegación con un modal forzoso hasta que el usuario acepte.
 */
export function TermsGuard({ children, forced, onClose }: { children?: React.ReactNode, forced?: boolean, onClose?: () => void }) {
    const { user, profile, loading } = useUser();
    const { toast } = useToast();
    const [isAccepting, setIsAccepting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [checked, setChecked] = useState(false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            setHasScrolledToBottom(true);
        }
    };

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
        if (!user || !checked) return;
        
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
                    <div 
                        className="flex-1 overflow-y-auto p-8 text-sm text-zinc-400 space-y-8 leading-relaxed custom-scrollbar relative"
                        onScroll={handleScroll}
                    >
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-zinc-300 font-medium">
                                Hemos actualizado nuestro marco legal para darte mayor respaldo. Debés deslizar hasta el final del documento para habilitar la firma digital y continuar.
                            </p>
                        </div>

                        <PassengerSpecificTerms />
                        <LiabilityPolicyText />
                        <CancellationPolicyText />
                        <VerificationPolicyText />
                        <ScoringPolicyText />
                        <SuspensionPolicyText />
                        <PrivacyPolicyText />

                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 text-zinc-600">
                                <AlertCircle className="h-3 w-3" />
                                <p className="text-[10px] italic">Este acuerdo es vinculante y rige en la jurisdicción de la Provincia de Chubut, Argentina.</p>
                            </div>
                        </div>
                        
                        {!hasScrolledToBottom && (
                            <div className="sticky bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none flex items-end justify-center pb-4">
                                <div className="bg-indigo-500/20 text-indigo-400 text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-full border border-indigo-500/30 animate-pulse">
                                    Deslizá hacia abajo para continuar
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer con Acción Fijo */}
                    <div className="p-6 sm:p-8 pb-10 bg-zinc-900 border-t border-white/5 shrink-0 flex flex-col gap-4">
                        <div className={`transition-opacity duration-300 ${!hasScrolledToBottom ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                            <label className="flex items-start gap-3 px-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    required
                                    checked={checked} 
                                    onChange={e => setChecked(e.target.checked)} 
                                    className="mt-0.5 h-4 w-4 rounded border-white/10 bg-zinc-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" 
                                />
                                <p className="text-[10px] text-zinc-400 leading-tight group-hover:text-zinc-300">
                                    He leído íntegramente y acepto los términos del contrato de usuario. Confirmo que mi IP y dispositivo quedarán registrados como firma electrónica en conformidad con la normativa vigente.
                                </p>
                            </label>
                        </div>
                        <Button 
                            onClick={handleAccept}
                            disabled={isAccepting || !checked || !hasScrolledToBottom}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-[0.98] mb-2 sm:mb-0"
                        >
                            {isAccepting ? (
                                <VamoIcon name="loader" className="h-6 w-6 animate-spin" />
                            ) : (
                                "Firma Digital y Continuar"
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
