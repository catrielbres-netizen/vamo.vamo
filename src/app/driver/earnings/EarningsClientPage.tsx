
'use client';
import { useState, useTransition, useEffect } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams, useRouter } from 'next/navigation';

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

const TOPUP_AMOUNTS = [5000, 10000, 20000];

interface EarningsClientPageProps {
    createPreferenceAction: (formData: FormData) => Promise<void>;
}

export default function EarningsClientPage({ createPreferenceAction }: EarningsClientPageProps) {
    const { user, profile, loading: isLoading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedAmount, setSelectedAmount] = useState<string | undefined>(undefined);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const mpStatus = searchParams.get('mp_status');
        if (mpStatus) {
            if (mpStatus === 'success') {
                toast({
                    title: '✅ Pago Aprobado',
                    description: 'Tu pago fue aprobado. Tu saldo se actualizará en breve.',
                });
            } else if (mpStatus === 'failure') {
                 toast({
                    variant: 'destructive',
                    title: '❌ Pago Rechazado',
                    description: 'La transacción no pudo ser completada. Intentá con otro medio de pago.',
                });
            } else if (mpStatus === 'pending') {
                 toast({
                    title: '⏳ Pago Pendiente',
                    description: 'Tu pago está siendo procesado por Mercado Pago.',
                });
            }
            // Clean URL
            router.replace('/driver/earnings');
        }
    }, [searchParams, router, toast]);


    const handleFormAction = async () => {
        if (!selectedAmount || !user?.uid) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccioná un monto.' });
            return;
        }

        const formData = new FormData();
        formData.append('amount', selectedAmount);
        formData.append('driverId', user.uid);
        
        startTransition(async () => {
            try {
                await createPreferenceAction(formData);
                // The redirect will happen on the server
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al crear pago', description: error.message });
            }
        });

        setIsDialogOpen(false);
    };
    
    if (isLoading || !profile) {
        return <p className="text-center">Cargando panel financiero...</p>;
    }
    
    const platformCreditPaid = profile.platformCreditPaid ?? 0;

    return (
        <>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cargar Saldo con Mercado Pago</DialogTitle>
                        <DialogDescription>
                            Seleccioná el monto que querés cargar. Serás redirigido a Mercado Pago para completar la transacción de forma segura.
                        </DialogDescription>
                    </DialogHeader>
                     <form>
                        <RadioGroup value={selectedAmount} onValueChange={setSelectedAmount} className="grid gap-4 my-4">
                            {TOPUP_AMOUNTS.map(amount => (
                                <Label key={amount} htmlFor={`amount-${amount}`} className="flex items-center justify-between p-4 rounded-lg border has-[:checked]:border-primary cursor-pointer">
                                    <span className="font-semibold text-lg">{formatCurrency(amount)}</span>
                                    <RadioGroupItem value={amount.toString()} id={`amount-${amount}`} />
                                </Label>
                            ))}
                        </RadioGroup>
                    </form>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleFormAction} disabled={!selectedAmount || isPending}>
                            {isPending ? 'Procesando...' : 'Pagar con Mercado Pago'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><VamoIcon name="wallet" /> Billetera VamO</CardTitle>
                        <CardDescription>Crédito para el pago automático de comisiones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Saldo Disponible</p>
                            <p className={cn("text-3xl font-bold", platformCreditPaid >= 0 ? "text-primary" : "text-destructive")}>
                                {formatCurrency(platformCreditPaid)}
                            </p>
                            {profile.promoCreditGranted && <p className="text-xs text-muted-foreground">(Incluye tu bono de bienvenida)</p>}
                        </div>
                        
                        {platformCreditPaid < 0 && (
                            <Alert variant="destructive">
                            <VamoIcon name="alert-triangle" className="h-4 w-4" />
                            <AlertTitle>¡Saldo Insuficiente!</AlertTitle>
                            <AlertDescription>
                                Tu saldo es negativo. Por favor, cargá crédito para poder seguir recibiendo viajes.
                            </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={() => setIsDialogOpen(true)}>
                            <VamoIcon name="credit-card" className="mr-2" /> Cargar Saldo
                        </Button>
                    </CardFooter>
                </Card>
                
                <Alert>
                    <VamoIcon name="info" className="h-4 w-4" />
                    <AlertTitle>¿Cómo funciona la comisión?</AlertTitle>
                    <AlertDescription>
                    La comisión por el uso de la plataforma se descuenta automáticamente de tu billetera al finalizar cada viaje.
                    <br />
                    <strong>Si tu saldo es insuficiente, no podrás recibir nuevos viajes hasta recargarlo.</strong> El crédito promocional no se utiliza para cubrir deudas.
                    </AlertDescription>
                </Alert>
            </div>
        </>
    );
}
