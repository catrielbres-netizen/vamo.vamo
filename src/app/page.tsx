'use client';

import { ActiveRideCard } from '@/components/active-ride-card';
import { RideRequestForm } from '@/components/ride-request-form';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRides } from '@/hooks/use-rides';

export default function PassengerPage() {
  const { currentUser } = useCurrentUser();
  const { rides } = useRides();

  if (!currentUser || currentUser.role !== 'passenger') {
    return (
      <div className="container py-10 text-center">
        <p>Por favor, cambiá a un perfil de pasajero para ver esta página.</p>
      </div>
    );
  }

  const myRide = rides.find(
    (ride) =>
      ride.passenger.id === currentUser.id && ride.status !== 'finalizado'
  );

  return (
    <div className="container mx-auto max-w-2xl py-8">
      {myRide ? (
        <ActiveRideCard rideId={myRide.id} />
      ) : (
        <RideRequestForm passengerId={currentUser.id} />
      )}
    </div>
  );
}
