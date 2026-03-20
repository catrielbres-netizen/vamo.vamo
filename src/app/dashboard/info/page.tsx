
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ServiceInfoCard = ({ title, iconName, description, models, children }: { title: string, iconName: string, description: string, models: string, children: React.ReactNode }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <VamoIcon name={iconName} className="w-6 h-6 text-primary" />
                {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="rates">
                    <AccordionTrigger>Ver Tarifas</AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-1">
                       {children}
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="models">
                    <AccordionTrigger>Modelos de Vehículos</AccordionTrigger>
                    <AccordionContent>
                        <p className="text-sm">{models}</p>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </CardContent>
    </Card>
);

export default function InfoPage() {
    return (
        <div className="space-y-6">
            <ServiceInfoCard
                title="Premium"
                iconName="car"
                description="Servicio de Taxis y Remises con licencia."
                models="Vehículos habilitados como taxi o remis por la autoridad local."
            >
                <p><strong>Tarifa Diurna:</strong> Base $1.400 + $152 cada 100m.</p>
                <p><strong>Tarifa Nocturna:</strong> Base $1.652 + $189 cada 100m.</p>
                <p><strong>Espera por minuto:</strong> $220 (diurna) / $277 (nocturna).</p>
            </ServiceInfoCard>

            <ServiceInfoCard
                title="Express"
                iconName="route"
                description="Viajes directos y económicos, con un 10% de descuento."
                models="Realizado por la flota de taxis y remises habilitados en la plataforma."
            >
                 <p>Aplica un <strong>10% de descuento</strong> sobre la tarifa Premium correspondiente (diurna o nocturna).</p>
            </ServiceInfoCard>

            <Alert>
                <VamoIcon name="info" className="h-4 w-4" />
                <AlertTitle>¿Sabías qué?</AlertTitle>
                <AlertDescription>
                    Para garantizar una mayor disponibilidad, un conductor de categoría Premium puede aceptar un viaje Express, pero no al revés. ¡Siempre viajarás con la misma o mejor calidad, al precio que elegiste!
                </AlertDescription>
            </Alert>
        </div>
    );
}
