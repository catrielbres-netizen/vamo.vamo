
'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import { createPreferenceAction } from './actions';
import { VamoIcon } from '@/components/VamoIcon';

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

const TOPUP_AMOUNTS = [5000, 10000, 20000];

function SubmitButton({ selectedAmount }: { selectedAmount: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={!selectedAmount || pending}>
      {pending ? <VamoIcon name="loader" className="animate-spin" /> : null}
      {pending ? 'Procesando...' : `Pagar ${formatCurrency(Number(selectedAmount))}`}
    </Button>
  );
}

export function PaymentForm({ driverId, onCancel }: { driverId: string, onCancel: () => void }) {
    const [selectedAmount, setSelectedAmount] = useState<string>("5000");
    
    return (
        <form action={createPreferenceAction}>
            <input type="hidden" name="driverId" value={driverId} />
            <RadioGroup name="amount" value={selectedAmount} onValueChange={setSelectedAmount} className="grid gap-4 my-4">
                {TOPUP_AMOUNTS.map(amount => (
                    <Label key={amount} htmlFor={`amount-${amount}`} className="flex items-center justify-between p-4 rounded-lg border has-[:checked]:border-primary cursor-pointer">
                        <span className="font-semibold text-lg">{formatCurrency(amount)}</span>
                        <RadioGroupItem value={amount.toString()} id={`amount-${amount}`} />
                    </Label>
                ))}
            </RadioGroup>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} type="button">Cancelar</Button>
                <SubmitButton selectedAmount={selectedAmount} />
            </DialogFooter>
        </form>
    );
}
