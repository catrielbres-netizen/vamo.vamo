// @/lib/store.tsx
'use client';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';
import { initialRides, initialUsers } from './data';
import type { Ride, RideService, RideStatus, User } from './types';

interface Store {
  rides: Ride[];
  users: User[];
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  requestRide: (data: {
    passengerId: string;
    origin: string;
    destination: string;
    serviceType: RideService;
    fare: number;
    distanceMeters: number;
    estimatedTimeMinutes: number;
  }) => void;
  acceptRide: (rideId: string, driver: User) => void;
  updateRideStatus: (rideId: string, status: RideStatus) => void;
}

const StoreContext = createContext<Store | null>(null);

const useLocalStorage = <T,>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.log(error);
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    }
  }, [key, storedValue, hydrated]);

  return [storedValue, setStoredValue, hydrated] as const;
};

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const [rides, setRides, ridesHydrated] = useLocalStorage<Ride[]>(
    'rides',
    initialRides
  );
  const [users] = useState<User[]>(initialUsers);
  const [currentUserId, setCurrentUserId, userHydrated] =
    useLocalStorage<string>('currentUserId', users[0].id);

  const updateRide = useCallback(
    (rideId: string, updates: Partial<Ride>) => {
      setRides((prevRides) =>
        prevRides.map((r) => (r.id === rideId ? { ...r, ...updates } : r))
      );
    },
    [setRides]
  );

  const calculateFinalFare = (ride: Ride) => {
    const baseFare = 1400;
    const distanceFare = (ride.distanceMeters! / 100) * 120;
    const pauseFare = (ride.pauseDuration / 60) * 100;

    let total = baseFare + distanceFare + pauseFare;

    if (ride.serviceType === 'Privado') total *= 0.9;
    if (ride.serviceType === 'Express') total *= 0.75;
    // Assuming night fare was already in the initial quote, or we can add a flag
    return total;
  };

  const updateRideStatus = useCallback(
    (rideId: string, status: RideStatus) => {
      const ride = rides.find((r) => r.id === rideId);
      if (!ride) return;

      const updates: Partial<Ride> = { status };

      if (status === 'pausado' && ride.status === 'activo') {
        updates.lastPauseTime = Date.now();
      }

      if (
        status === 'activo' &&
        ride.status === 'pausado' &&
        ride.lastPauseTime
      ) {
        const pauseDuration = (Date.now() - ride.lastPauseTime) / 1000;
        updates.pauseDuration = (ride.pauseDuration || 0) + pauseDuration;
        updates.lastPauseTime = undefined;
      }

      if (status === 'finalizado') {
        updates.endTime = Date.now();
        updates.fare = calculateFinalFare({ ...ride, ...updates });
      }

      updateRide(rideId, updates);
    },
    [rides, updateRide]
  );

  const requestRide = useCallback(
    (data: {
      passengerId: string;
      origin: string;
      destination: string;
      serviceType: RideService;
      fare: number;
      distanceMeters: number;
      estimatedTimeMinutes: number;
    }) => {
      const passenger = users.find((u) => u.id === data.passengerId);
      if (!passenger) return;

      const newRide: Ride = {
        id: `ride_${Date.now()}`,
        passenger,
        origin: data.origin,
        destination: data.destination,
        serviceType: data.serviceType,
        status: 'confirmado',
        fare: data.fare,
        distanceMeters: data.distanceMeters,
        estimatedTimeMinutes: data.estimatedTimeMinutes,
        startTime: Date.now(),
        pauseDuration: 0,
      };
      setRides((prev) => [...prev, newRide]);
    },
    [users, setRides]
  );

  const acceptRide = useCallback(
    (rideId: string, driver: User) => {
      updateRide(rideId, { driver, status: 'conductor_encontrado' });
    },
    [updateRide]
  );

  const value = useMemo(
    () => ({
      rides,
      users,
      currentUserId,
      setCurrentUserId,
      requestRide,
      acceptRide,
      updateRideStatus,
    }),
    [
      rides,
      users,
      currentUserId,
      setCurrentUserId,
      requestRide,
      acceptRide,
      updateRideStatus,
    ]
  );

  if (!ridesHydrated || !userHydrated) {
    return null; // O un spinner de carga
  }

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore debe ser usado dentro de un StoreProvider');
  }
  return context;
};
