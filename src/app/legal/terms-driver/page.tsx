'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Scale, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function DriverTermsPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 pb-20">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-zinc-400 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-sm font-black uppercase tracking-widest text-white">Términos del Conductor</h1>
            </div>

            <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
                {/* Intro Section */}
                <div className="space-y-4">
                    <div className="h-16 w-16 bg-primary/10 rounded-[2rem] flex items-center justify-center border border-primary/20 mb-6">
                        <Scale className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Acuerdo <span className="text-primary not-italic">VamO</span> PRO</h2>
                    <p className="text-zinc-500 font-medium">Versión 1.1 | Actualización Abril 2026</p>
                    
                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-4 mt-6">
                        <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                        <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                            Este documento rige la relación entre el prestador del servicio (Conductor) y la plataforma tecnológica VamO. La aceptación de estos términos es obligatoria para operar.
                        </p>
                    </div>
                </div>

                {/* Content Sections */}
                <div className="space-y-12">
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">1. Naturaleza de la relación e Intermediación</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            VamO PRO es exclusivamente una plataforma tecnológica de intermediación. El Conductor actúa como un <span className="text-white font-bold">profesional independiente</span> por su propia cuenta y riesgo. No existe relación de dependencia laboral, sociedad, ni representación entre el Conductor y VamO.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">2. Fondo de Asistencia VamO (F.A.P.)</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            Para viajes en modalidad Express, el Conductor contribuye a un <span className="text-white font-bold">Fondo de Asistencia</span>. Este fondo constituye un beneficio <span className="text-white font-bold">discrecional y limitado</span>, destinado a la asistencia económica ante imprevistos operativos bajo evaluación de VamO. NO constituye un contrato de seguro ni genera una obligación automática de indemnización.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">3. Estado del Vehículo</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            El vehículo debe estar en condiciones óptimas de limpieza y funcionamiento mecánico. Debe contar con la documentación obligatoria requerida por el municipio correspondiente.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">4. Calificaciones y Comportamiento</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            El sistema de calificación mutua es fundamental para la comunidad. Conductores con promedios bajos de manera sostenida o reportes de mala conducta podrán ser suspendidos temporalmente.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">5. Tratamiento de Datos y Log Legal</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            VamO procesa datos de geolocalización en tiempo real. Al aceptar estos términos, consientes el registro de tu <span className="text-white font-bold">identificador de dispositivo y dirección IP</span> como comprobante de aceptación de la versión vigente de este acuerdo.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="font-black text-white uppercase tracking-widest">6. Suspensión y Jurisdicción</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            VamO se reserva el derecho de suspender cuentas ante incumplimientos. Cualquier controversia será sometida a la jurisdicción de los tribunales de la <span className="text-white font-bold">Provincia de Chubut</span>, renunciando a cualquier otro fuero.
                        </p>
                    </section>
                </div>

                {/* Footer Note */}
                <div className="pt-10 border-t border-white/5 text-center">
                    <p className="text-xs text-zinc-600 font-medium italic">
                        VamO PRO - Rawson, Chubut, Argentina.
                    </p>
                </div>
            </div>
        </div>
    );
}
