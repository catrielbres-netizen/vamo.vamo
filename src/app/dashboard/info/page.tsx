// src/app/dashboard/info/page.tsx
'use client';
export const dynamic = 'force-dynamic';

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
                description="Nuestro mejor servicio. Vehículos modernos y conductores con la mejor calificación."
                models="Modelos 2022 en adelante, 4 puertas, con aire acondicionado y en excelente estado."
            >
                <p><strong>Tarifa Diurna:</strong> Base $1.483 + $152 cada 100m.</p>
                <p><strong>Tarifa Nocturna:</strong> Base $1.652 + $189 cada 100m.</p>
                <p><strong>Espera por minuto:</strong> $220 (diurna) / $277 (nocturna).</p>
            </ServiceInfoCard>

            <ServiceInfoCard
                title="Privado"
                iconName="user"
                description="Autos particulares en buen estado a un precio competitivo. ¡Un 10% más barato!"
                models="Modelos 2016 a 2021, 4 puertas, en buen estado de mantenimiento."
            >
                <p>Aplica un <strong>10% de descuento</strong> sobre la tarifa Premium correspondiente (diurna o nocturna).</p>
            </ServiceInfoCard>

            <ServiceInfoCard
                title="Express"
                iconName="route"
                description="La opción más económica para moverte por la ciudad. ¡Un 25% más barato!"
                models="Modelos 2015 o anteriores. Vehículos funcionales y seguros para viajes cortos."
            >
                 <p>Aplica un <strong>25% de descuento</strong> sobre la tarifa Premium correspondiente (diurna o nocturna).</p>
            </ServiceInfoCard>

            <Alert>
                <VamoIcon name="info" className="h-4 w-4" />
                <AlertTitle>¿Sabías qué?</AlertTitle>
                <AlertDescription>
                    Para garantizar una mayor disponibilidad, un conductor de categoría superior (ej. Premium) puede aceptar un viaje de una categoría inferior (ej. Express). Sin embargo, un conductor Express no puede aceptar un viaje Premium. ¡Viajarás con la misma o mejor calidad, al precio que elegiste!
                </AlertDescription>
            </Alert>
        </div>
    );
}
