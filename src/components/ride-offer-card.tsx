// @/components/ride-offer-card.tsx
'use client';

import { CircleDollarSign, Flag, MapPin, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRideById } from '@/hooks/use-rides';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const OFFER_TIMEOUT = 30; // 30 seconds

export function RideOfferCard({ rideId }: { rideId: string }) {
  const { ride } = useRideById(rideId);
  const { currentUser } = useCurrentUser();
  const { acceptRide } = useStore();
  const [timeLeft, setTimeLeft] = useState(OFFER_TIMEOUT);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  if (!ride || !currentUser) {
    return null;
  }

  const handleAccept = () => {
    acceptRide(ride.id, currentUser);
  };

  const progress = (timeLeft / OFFER_TIMEOUT) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Ride Offer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">From</p>
            <p className="font-medium">{ride.origin}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Flag className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">To</p>
            <p className="font-medium">{ride.destination}</p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">Offered Fare</span>
          </div>
          <span className="text-lg font-bold">${ride.fare?.toFixed(2)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Service Type: {ride.serviceType}
        </p>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="h-4 w-4" />
          <span>Offer expires in {timeLeft}s</span>
        </div>
        <Progress value={progress} className="h-1" />
        <Button onClick={handleAccept} disabled={timeLeft <= 0} size="lg">
          {timeLeft > 0 ? 'Accept Ride' : 'Offer Expired'}
        </Button>
      </CardFooter>
    </Card>
  );
}
