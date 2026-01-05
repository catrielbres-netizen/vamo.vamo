// src/app/driver/earnings/page.tsx
'use client';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function EarningsPage() {
    const { user, profile, loading: isLoading } = useUser();
    const adminWhatsAppNumber = "5492804967673";

    if (isLoading || !profile) {
        return <p className="text-center">Cargando panel financiero...</p>;
    }
    
    const platformCreditPaid = profile.platformCreditPaid ?? 0;
    const platformCreditPromo = profile.platformCreditPromo ?? 0;
    const totalCredit = platformCreditPaid + platformCreditPromo;

    const handleLoadCredit = () => {
        const message = "Hola! Quiero cargar crédito en mi billetera de VamO.";
        const url = `https://wa.me/${adminWhatsAppNumber}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><VamoIcon name="wallet" /> Billetera VamO</CardTitle>
                    <CardDescription>Crédito para el pago automático de comisiones.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div>
                         <p className="text-sm text-muted-foreground">Saldo Total Disponible</p>
                         <p className={cn("text-3xl font-bold", totalCredit >= 0 ? "text-primary" : "text-destructive")}>
                            {formatCurrency(totalCredit)}
                        </p>
                     </div>
                     <div className="text-xs space-y-1 text-muted-foreground bg-secondary/50 p-2 rounded-md">
                        <div className="flex justify-between"><span>Crédito Cargado:</span> <span className="font-medium">{formatCurrency(platformCreditPaid)}</span></div>
                        <div className="flex justify-between"><span>Crédito Promocional:</span> <span className="font-medium">{formatCurrency(platformCreditPromo)}</span></div>
                     </div>
                     {platformCreditPaid < 0 && (
                        <Alert variant="destructive">
                           <VamoIcon name="alert-triangle" className="h-4 w-4" />
                           <AlertTitle>¡Saldo Insuficiente!</AlertTitle>
                           <AlertDescription>
                              Tu saldo cargado es negativo. Por favor, cargá crédito para poder seguir recibiendo viajes.
                           </AlertDescription>
                        </Alert>
                     )}
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={handleLoadCredit}>
                        <VamoIcon name="credit-card" /> Cargar Crédito
                    </Button>
                </CardFooter>
            </Card>
            
            <Alert>
                <VamoIcon name="info" className="h-4 w-4" />
                <AlertTitle>¿Cómo funciona la comisión?</AlertTitle>
                <AlertDescription>
                   La comisión por el uso de la plataforma se descuenta automáticamente de tu Crédito Cargado al finalizar cada viaje.
                   <br />
                   <strong>Si tu saldo cargado es insuficiente, no podrás recibir nuevos viajes hasta recargarlo.</strong> El crédito promocional no se utiliza para cubrir deudas.
                </AlertDescription>
            </Alert>
        </div>
    );
}
