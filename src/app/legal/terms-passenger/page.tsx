'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Scale, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function PassengerTermsPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 pb-20">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-zinc-400 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-sm font-black uppercase tracking-widest text-white">Términos del Pasajero</h1>
            </div>

            <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
                {/* Intro Section */}
                <div className="space-y-4">
                    <div className="h-16 w-16 bg-primary/10 rounded-[2rem] flex items-center justify-center border border-primary/20 mb-6">
                        <Scale className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Acuerdo <span className="text-primary not-italic">VamO</span></h2>
                    <p className="text-zinc-500 font-medium">Versión 1.3 | Actualización Abril 2026</p>
                    
                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-4 mt-6">
                        <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                        <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                            Este documento describe los términos de uso de la plataforma VamO para pasajeros. Al solicitar un viaje, aceptas estas condiciones.
                        </p>
                    </div>
                </div>

                {/* Content Sections */}
                <div className="space-y-12">
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">1. Naturaleza del Servicio</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            VamO es una plataforma tecnológica de <span className="text-white font-bold">intermediación</span>. No somos una empresa de transporte. Actuamos como un nexo técnico entre tú y conductores independientes (Express) o profesionales habilitados (Taxi/Remis).
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">2. Fondo de Asistencia (F.A.P.)</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            Los viajes en modalidad Express incluyen una cuota destinada al <span className="text-white font-bold">Fondo de Asistencia VamO</span>. Este fondo es un beneficio <span className="text-white font-bold">discrecional y limitado</span> para asistencia económica ante incidentes, sujeto a auditoría interna. No constituye un seguro ni una garantía de indemnización automática.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">3. Taxis y Remises</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            En viajes de Taxi o Remis, rigen los seguros de pasajeros y regulaciones municipales propias de dichos servicios profesionales. VamO no ofrece asistencia mediante F.A.P. en estas modalidades, ya que la responsabilidad legal recae en el prestador habilitado.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">4. Conducta y Seguridad</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            El pasajero se compromete a mantener un comportamiento respetuoso. VamO se reserva el derecho de inhabilitar cuentas por reportes de conducta inapropiada o mal uso de la plataforma.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">5. Log Legal de Aceptación</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            Para tu seguridad y la de la plataforma, al aceptar estos términos, consientes el registro de tu <span className="text-white font-bold">dirección IP e identificador de dispositivo</span> como prueba técnica de conformidad con esta versión de los términos.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">6. Jurisdicción</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            Este contrato se rige por las leyes de la República Argentina y cualquier disputa será resuelta en los tribunales ordinarios de la <span className="text-white font-bold">Provincia de Chubut</span>.
                        </p>
                    </section>
                </div>

                {/* Footer Note */}
                <div className="pt-10 border-t border-white/5 text-center">
                    <p className="text-xs text-zinc-600 font-medium italic">
                        VamO - Rawson, Chubut, Argentina.
                    </p>
                </div>
            </div>
        </div>
    );
}
