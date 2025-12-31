'use client'

import { useCollection, useMemoFirebase } from '@/firebase'
import { collection } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function AdminRides() {
  const db = useFirestore()
  const ridesQuery = useMemoFirebase(() => db ? collection(db, 'rides') : null, [db]);
  const { data: rides, isLoading } = useCollection(ridesQuery)

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold">Viajes</h1>
        <Card>
            <CardHeader>
                <CardTitle>Todos los Viajes ({rides?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading && <p>Cargando viajes...</p>}
                <ul className="space-y-3">
                {rides?.map(ride => (
                    <li key={ride.id} className="border p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                            <p className="font-semibold">Viaje a {ride.destination?.address ?? 'Destino desconocido'}</p>
                            <Badge variant="outline" className="capitalize">{ride.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 space-y-1">
                            <p>Pasajero: {ride.passengerName ?? ride.passengerId}</p>
                            <p>Conductor: {ride.driverName ?? ride.driverId ?? 'No asignado'}</p>
                        </div>
                    </li>
                ))}
                </ul>
            </CardContent>
        </Card>
    </div>
  )
}
