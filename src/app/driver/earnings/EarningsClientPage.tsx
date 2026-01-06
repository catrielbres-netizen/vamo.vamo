
'use client';
import { useState, useTransition, useEffect, useMemo } from 'react';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { PlatformTransaction } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';
import { Separator } from '@/components/ui/separator';

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

const TransactionHistory = ({ driverId }: { driverId: string }) => {
    const firestore = useFirestore();

    const transactionsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'platform_transactions'),
            where('driverId', '==', driverId),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, driverId]);

    const { data: transactions, isLoading } = useCollection<WithId<PlatformTransaction>>(transactionsQuery);
    
    // El saldo emerge del ledger
    const balance = useMemo(() => {
        if (!transactions) return 0;
        return transactions.reduce((acc, tx) => acc + tx.amount, 0);
    }, [transactions]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><VamoIcon name="wallet" /> Billetera VamO</CardTitle>
                <CardDescription>Crédito para el pago automático de comisiones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <p className="text-sm text-muted-foreground">Saldo Actual</p>
                    <p className={cn("text-4xl font-bold", balance >= 0 ? "text-primary" : "text-destructive")}>
                        {isLoading ? '...' : formatCurrency(balance)}
                    </p>
                </div>
                 {balance < 0 && (
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
                 <DialogTrigger asChild>
                    <Button className="w-full">
                         <VamoIcon name="credit-card" className="mr-2" /> Cargar Saldo
                    </Button>
                 </DialogTrigger>
            </CardFooter>
            <Separator className="my-4" />
            <CardHeader>
                 <CardTitle className="text-lg">Historial de Movimientos</CardTitle>
            </CardHeader>
             <CardContent>
                 {isLoading && <p className="text-center text-muted-foreground">Cargando transacciones...</p>}
                 {!isLoading && transactions && transactions.length > 0 ? (
                     <ul className="space-y-3">
                         {transactions.map(tx => (
                             <li key={tx.id} className="flex justify-between items-center text-sm">
                                 <div>
                                     <p className={cn("font-medium capitalize", tx.amount > 0 ? 'text-green-500' : 'text-destructive-foreground/80')}>
                                        {tx.note || tx.type.replace(/_/g, ' ')}
                                    </p>
                                     <p className="text-xs text-muted-foreground">{(tx.createdAt as Timestamp)?.toDate().toLocaleString('es-AR')}</p>
                                 </div>
                                 <p className={cn("font-bold", tx.amount > 0 ? 'text-green-600' : 'text-destructive-foreground')}>
                                     {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                 </p>
                             </li>
                         ))}
                     </ul>
                 ) : !isLoading && (
                     <p className="text-center text-muted-foreground py-4">No hay movimientos en tu billetera.</p>
                 )}
             </CardContent>
        </Card>
    )
}

export default function EarningsClientPage({ createPreferenceAction }: EarningsClientPageProps) {
    const { user, loading: isLoading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedAmount, setSelectedAmount] = useState<string | undefined>("5000");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const mpStatus = searchParams.get('mp_status');
        if (mpStatus) {
            if (mpStatus === 'success') {
                toast({
                    title: '✅ Pago Aprobado',
                    description: 'Tu pago fue aprobado. Tu saldo se actualizará en breve cuando recibamos la confirmación del servidor.',
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
                // La redirección a MP ocurre en la Server Action
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al crear pago', description: error.message });
            }
        });

        setIsDialogOpen(false);
    };
    
    if (isLoading || !user) {
        return <p className="text-center">Cargando panel financiero...</p>;
    }

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <TransactionHistory driverId={user.uid} />
            
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
                        {isPending ? 'Procesando...' : `Pagar ${formatCurrency(Number(selectedAmount))}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
