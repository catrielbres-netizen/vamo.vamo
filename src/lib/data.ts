// @/lib/data.ts
import type { Ride, User } from './types';
import placeholderImages from './placeholder-images.json';

const getAvatar = (id: string) =>
  placeholderImages.placeholderImages.find((p) => p.id === id)?.imageUrl || '';

export const initialUsers: User[] = [
  {
    id: 'user_passenger_1',
    name: 'Cata',
    role: 'passenger',
    avatarUrl: getAvatar('passenger-avatar'),
  },
  {
    id: 'user_driver_1',
    name: 'Benja',
    role: 'driver',
    avatarUrl: getAvatar('driver-1-avatar'),
  },
  {
    id: 'user_driver_2',
    name: 'Maria',
    role: 'driver',
    avatarUrl: getAvatar('driver-2-avatar'),
  },
  {
    id: 'user_admin_1',
    name: 'Admin',
    role: 'admin',
    avatarUrl: getAvatar('admin-avatar'),
  },
];

export const initialRides: Ride[] = [
  {
    id: 'ride_1',
    passenger: initialUsers[0],
    origin: 'Centro',
    destination: 'Barrio Norte',
    serviceType: 'Premium',
    status: 'en_camino',
    driver: initialUsers[1],
    fare: 4500,
    distanceMeters: 15000,
    estimatedTimeMinutes: 25,
    startTime: Date.now() - 10 * 60 * 1000,
    pauseDuration: 0,
  },
  {
    id: 'ride_2',
    passenger: {
      id: 'user_passenger_2',
      name: 'David',
      role: 'passenger',
      avatarUrl: 'https://picsum.photos/seed/david/100/100',
    },
    origin: 'Aeropuerto',
    destination: 'Hotel Principal',
    serviceType: 'Express',
    status: 'confirmado',
    fare: 2800,
    distanceMeters: 8000,
    estimatedTimeMinutes: 15,
    startTime: Date.now(),
    pauseDuration: 0,
  },
];
