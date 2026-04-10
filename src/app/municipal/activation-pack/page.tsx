'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';

export default function ActivationPackPage() {
    const sections = [
        {
            title: "1. ¿Cómo funciona VamO?",
            icon: "info",
            content: "VamO es una plataforma de movilidad urbana que permite regular y potenciar el servicio de transporte en tu ciudad sin inversión inicial. Conecta pasajeros con conductores habilitados de forma segura y transparente."
        },
        {
            title: "2. Rol de la Municipalidad",
            icon: "landmark",
            content: "El municipio actúa como autoridad de control. Es responsable de validar los antecedentes de los conductores express, verificar la documentación técnica de los vehículos y asegurar que el servicio respete las normativas locales."
        },
        {
            title: "3. El Flujo Express",
            icon: "zap",
            content: "Los conductores particulares pueden operar bajo el esquema 'Express' tras superar una validación manual estricta del municipio. Esto incluye revisión de DNI, Licencia, Seguro, Antecedentes Penales y Habilitación Municipal."
        },
        {
            title: "4. Fondo de Asistencia (F.A.P.)",
            icon: "shield-check",
            content: "El F.A.P. es un fondo de asistencia económica limitada para pasajeros en viajes Express. El municipio supervisa este fondo y audita los reclamos para garantizar transparencia en su distribución."
        },
        {
            title: "5. Pasos para Activar tu Ciudad",
            icon: "list-todo",
            content: "1. Completa el onboarding de administrador. 2. Define las tarifas (Day/Night) en la sección 'Tarifas'. 3. Empieza a procesar solicitudes de conductores pendientes en 'Conductores'. 4. Lanza oficialmente VamO en tu jurisdicción."
        }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-10 py-10">
            <div className="text-center space-y-2">
                <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                    <VamoIcon name="book-open" className="h-8 w-8 text-emerald-400" />
                </div>
                <h1 className="text-4xl font-black text-white">Manual de Activación VamO</h1>
                <p className="text-zinc-500 italic max-w-lg mx-auto text-sm">
                    Guía completa para administradores municipales sobre la puesta en marcha y operación del sistema.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sections.map((section, idx) => (
                    <Card key={idx} className="p-6 bg-zinc-900/50 border-white/5 space-y-4 hover:border-indigo-500/20 transition-all cursor-default group">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-white/[0.03] rounded-xl flex items-center justify-center border border-white/10 group-hover:border-indigo-500/30 transition-all">
                                <VamoIcon name={section.icon as any} className="h-5 w-5 text-indigo-400" />
                            </div>
                            <h3 className="font-black text-white">{section.title}</h3>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed pl-1">
                            {section.content}
                        </p>
                    </Card>
                ))}
            </div>

            <Card className="p-8 bg-indigo-600/10 border-indigo-500/20 text-center space-y-6">
                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-indigo-300">¿Necesitas soporte técnico?</h2>
                    <p className="text-zinc-400 text-sm">El equipo de VamO HUB Rawson está disponible para asistirte en la configuración inicial.</p>
                </div>
                <div className="flex justify-center gap-4">
                    <div className="px-4 py-2 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">
                        Email: soporte@vamo.app
                    </div>
                </div>
            </Card>
        </div>
    );
}
