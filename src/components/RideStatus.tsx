// @/components/RideStatus.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, CircleDashed, Car, MapPin, Flag, UserCheck, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";

const statusConfig: { [key: string]: { text: string; icon: React.ReactNode; progress: number } } = {
    "Buscando conductor...": { text: "Buscando conductor...", icon: <CircleDashed className="animate-spin" />, progress: 20 },
    "Conductor encontrado": { text: "Conductor encontrado", icon: <UserCheck />, progress: 40 },
    "El conductor está en camino": { text: "El conductor está en camino", icon: <Car />, progress: 60 },
    "El conductor ha llegado": { text: "El conductor ha llegado", icon: <MapPin />, progress: 80 },
    "Viaje en curso": { text: "Viaje en curso", icon: <Car className="animate-pulse"/>, progress: 90 },
    "Viaje finalizado": { text: "Viaje finalizado", icon: <PartyPopper />, progress: 100 },
};


export default function RideStatus({ status, rideData }: { status: string, rideData: any }) {
  const [currentStatus, setCurrentStatus] = useState(status);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);
  
  const config = statusConfig[currentStatus] || statusConfig["Buscando conductor..."];

  return (
    <Card>
        <CardHeader>
            <CardTitle>¡Tu viaje está en marcha!</CardTitle>
            <CardDescription>Seguí el estado de tu viaje en tiempo real.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
             <div className="p-4 mt-4 border rounded-lg bg-secondary/50">
                <div className="flex items-center space-x-3 mb-4">
                    <div className="text-primary">{config.icon}</div>
                    <h3 className="font-bold text-lg">{config.text}</h3>
                </div>
                <Progress value={config.progress} className="w-full" />
            </div>
            {rideData && (
                 <div className="text-sm space-y-2">
                    <p className="flex items-center"><Flag className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Destino:</strong> {rideData.destination}</p>
                    <p className="flex items-center"><Car className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Servicio:</strong> <span className="capitalize ml-1">{rideData.service}</span></p>
                    <p className="font-bold text-base">Tarifa Final: <span className="text-primary">${new Intl.NumberFormat('es-AR').format(rideData.fare)}</span></p>
                 </div>
            )}
        </CardContent>
    </Card>
  );
}
