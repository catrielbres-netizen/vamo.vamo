// @/components/active-ride-card.tsx
'use client';
import {
  Activity,
  Car,
  Check,
  CircleDollarSign,
  Clock,
  Flag,
  MapPin,
  Pause,
  Play,
  User,
} from 'lucide-react';
import Image from 'next/image';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRideById } from '@/hooks/use-rides';
import { useRideSimulation } from '@/hooks/use-ride-simulation';
import { useStore } from '@/lib/store';
import placeholderImages from '@/lib/placeholder-images.json';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { RideStatus, UserRole } from '@/lib/types';

const statusInfo: Record<
  RideStatus,
  { text: string; progress: number; icon: React.ReactNode }
> = {
  solicitado: {
    text: 'Viaje Solicitado',
    progress: 10,
    icon: <Activity className="h-4 w-4" />,
  },
  confirmado: {
    text: 'Viaje Confirmado',
    progress: 20,
    icon: <Check className="h-4 w-4" />,
  },
  buscando: {
    text: 'Buscando Conductor',
    progress: 30,
    icon: <Activity className="h-4 w-4" />,
  },
  conductor_encontrado: {
    text: 'Conductor Encontrado',
    progress: 40,
    icon: <Car className="h-4 w-4" />,
  },
  en_camino: {
    text: 'El Conductor está en camino',
    progress: 50,
    icon: <Car className="h-4 w-4" />,
  },
  llegado: {
    text: 'El Conductor ha Llegado',
    progress: 60,
    icon: <Car className="h-4 w-4" />,
  },
  activo: {
    text: 'Viaje en Progreso',
    progress: 80,
    icon: <Activity className="h-4 w-4" />,
  },
  pausado: {
    text: 'Viaje Pausado',
    progress: 75,
    icon: <Pause className="h-4 w-4" />,
  },
  finalizado: {
    text: 'Viaje Finalizado',
    progress: 100,
    icon: <Flag className="h-4 w-4" />,
  },
  cancelado: {
    text: 'Viaje Cancelado',
    progress: 0,
    icon: <Activity className="h-4 w-4" />,
  },
};

const UserInfo = ({ user, role }: { user: {name: string, avatarUrl: string}, role: UserRole }) => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarImage src={user.avatarUrl} alt={user.name} />
      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div>
      <p className="font-semibold">{user.name}</p>
      <p className="text-sm capitalize text-muted-foreground">{role === 'driver' ? 'Conductor' : 'Pasajero'}</p>
    </div>
  </div>
);

export function ActiveRideCard({ rideId }: { rideId: string }) {
  const { ride } = useRideById(rideId);
  const { currentUser } = useCurrentUser();
  const { updateRideStatus } = useStore();
  useRideSimulation(rideId);

  if (!ride) {
    return null;
  }

  const handleStatusChange = (status: RideStatus) => {
    updateRideStatus(rideId, status);
  };
  
  const mapImage = placeholderImages.placeholderImages.find(p => p.id === 'map-placeholder');

  const otherUser = currentUser?.role === 'passenger' ? ride.driver : ride.passenger;
  const otherUserRole = currentUser?.role === 'passenger' ? 'driver' : 'passenger';
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <CardTitle className="leading-tight">
          Viaje a <span className="text-primary">{ride.destination}</span>
        </CardTitle>
        <Badge variant="secondary" className="flex items-center gap-2 whitespace-nowrap">
          {statusInfo[ride.status].icon}
          {statusInfo[ride.status].text}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
            <Progress value={statusInfo[ride.status].progress} className="h-2" />
        </div>
        
        {mapImage && (
            <div className="overflow-hidden rounded-lg border">
                <Image
                src={mapImage.imageUrl}
                alt={mapImage.description}
                data-ai-hint={mapImage.imageHint}
                width={800}
                height={400}
                className="aspect-[2/1] w-full object-cover"
                />
            </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-4 rounded-lg border bg-secondary/50 p-4">
                <h3 className="font-semibold">Detalles del Viaje</h3>
                <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>Desde: {ride.origin}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <Flag className="h-4 w-4 text-muted-foreground" />
                    <span>Hasta: {ride.destination}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Tarifa: ${ride.fare?.toFixed(2)} ({ride.serviceType})</span>
                </div>
            </div>
            
            <div className="space-y-4 rounded-lg border bg-secondary/50 p-4">
                <h3 className="font-semibold">
                    {currentUser?.role === 'passenger' ? 'Tu Conductor' : 'Tu Pasajero'}
                </h3>
                {otherUser ? (
                    <UserInfo user={otherUser} role={otherUserRole} />
                ) : (
                    <p className="text-sm text-muted-foreground">Esperando asignación de conductor...</p>
                )}
            </div>
        </div>

      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 bg-secondary/30 p-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>ID del Viaje: {ride.id}</span>
        </div>
        {currentUser?.role === 'driver' && (
          <div className="flex items-center gap-2">
            {ride.status === 'llegado' && (
                <Button onClick={() => handleStatusChange('activo')} className="bg-green-600 hover:bg-green-700">Iniciar Viaje</Button>
            )}
            {ride.status === 'activo' && (
                <Button variant="outline" onClick={() => handleStatusChange('pausado')}><Pause className="mr-2"/>Pausar</Button>
            )}
            {ride.status === 'pausado' && (
                <Button variant="outline" onClick={() => handleStatusChange('activo')}><Play className="mr-2"/>Reanudar</Button>
            )}
            {['activo', 'pausado'].includes(ride.status) && (
                <Button onClick={() => handleStatusChange('finalizado')}>Finalizar Viaje</Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
