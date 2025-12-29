// @/components/ride-request-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { calculateFareAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useStore } from '@/lib/store';
import { RideService } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const formSchema = z.object({
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  serviceType: z.enum(['Premium', 'Privado', 'Express']),
  isNightTime: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

type FareResult = {
  fare: number;
  distanceMeters: number;
  estimatedTimeMinutes: number;
};

export function RideRequestForm({ passengerId }: { passengerId: string }) {
  const { requestRide } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [fareResult, setFareResult] = useState<FareResult | null>(null);
  const [formValues, setFormValues] = useState<FormValues | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      origin: 'Current Location',
      destination: '',
      serviceType: 'Premium',
      isNightTime: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    setFareResult(null);
    try {
      const result = await calculateFareAction(values);
      setFareResult(result);
      setFormValues(values);
      setIsConfirming(true);
    } catch (error) {
      console.error('Fare calculation failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRide = () => {
    if (formValues && fareResult) {
      requestRide({
        passengerId,
        origin: formValues.origin,
        destination: formValues.destination,
        serviceType: formValues.serviceType,
        fare: fareResult.fare,
        distanceMeters: fareResult.distanceMeters,
        estimatedTimeMinutes: fareResult.estimatedTimeMinutes,
      });
      setIsConfirming(false);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Where to?</CardTitle>
          <CardDescription>
            Enter your destination to see fare options.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Downtown Plaza" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Premium">Premium</SelectItem>
                        <SelectItem value="Privado">Privado</SelectItem>
                        <SelectItem value="Express">Express</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isNightTime"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Night Fare</FormLabel>
                      <FormDescription>
                        Applies a 5% surcharge for rides at night.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Sun className="h-5 w-5 text-muted-foreground" />
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <Moon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isLoading ? 'Calculating...' : 'Calculate Fare'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Dialog open={isConfirming} onOpenChange={setIsConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Your Ride</DialogTitle>
            <DialogDescription>
              Please review the details of your trip before confirming.
            </DialogDescription>
          </DialogHeader>
          {formValues && fareResult && (
            <div className="space-y-4 py-4">
              <p>
                <strong>From:</strong> {formValues.origin}
              </p>
              <p>
                <strong>To:</strong> {formValues.destination}
              </p>
              <p>
                <strong>Service:</strong> {formValues.serviceType}
              </p>
              <div className="rounded-lg bg-secondary p-4 text-center">
                <p className="text-sm text-muted-foreground">Estimated Fare</p>
                <p className="text-3xl font-bold text-primary">
                  ${fareResult.fare.toFixed(2)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirming(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmRide}>Confirm Ride</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
