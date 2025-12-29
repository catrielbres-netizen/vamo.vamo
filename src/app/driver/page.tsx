'use client';

import { ActiveRideCard } from '@/components/active-ride-card';
import { RideOfferCard } from '@/components/ride-offer-card';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRides } from '@/hooks/use-rides';
import { RideStatus } from '@/lib/types';

const availableStatuses: RideStatus[] = ['confirmed', 'searching'];

export default function DriverPage() {
  const { currentUser } = useCurrentUser();
  const { rides } = useRides();

  if (!currentUser || currentUser.role !== 'driver') {
    return (
      <div className="container py-10 text-center">
        <p>Please switch to a driver profile to view this page.</p>
      </div>
    );
  }

  const myActiveRide = rides.find(
    (ride) => ride.driver?.id === currentUser.id && ride.status !== 'finished'
  );

  const availableRides = rides.filter(
    (ride) =>
      availableStatuses.includes(ride.status) &&
      !ride.driver &&
      myActiveRide === undefined
  );

  return (
    <div className="container mx-auto max-w-4xl py-8">
      {myActiveRide ? (
        <ActiveRideCard rideId={myActiveRide.id} />
      ) : (
        <div>
          <h1 className="mb-6 text-3xl font-bold text-primary">
            Available Rides
          </h1>
          {availableRides.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {availableRides.map((ride) => (
                <RideOfferCard key={ride.id} rideId={ride.id} />
              ))}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed bg-card">
              <p className="text-muted-foreground">
                No available rides right now. Check back soon!
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
