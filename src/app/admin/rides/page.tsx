'use client'

import { useCollection, useMemoFirebase } from '@/firebase'
import { collection, query, where } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { UserProfile } from '@/lib/types'
import { WithId } from '@/firebase/firestore/use-collection'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const DriverListItem = ({ driver }: { driver: WithId<UserProfile> }) => (
    <Link href={`/admin/drivers/${driver.id}`}>
        <li className="border p-4 rounded-lg flex justify-between items-center hover:bg-accent transition-colors">
            <div>
                <p className="font-semibold">{driver.name ?? driver.email}</p>
                <p className="text-sm text-muted-foreground">{driver.email}</p>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Ver Detalles</span>
                <ChevronRight className="h-4 w-4" />
            </div>
        </li>
    </Link>
);


export default function AdminRidesPage() {
  const db = useFirestore()
  
  const driversQuery = useMemoFirebase(
    () => db ? query(collection(db, 'users'), where('role', '==', 'driver')) : null, 
    [db]
  );
  const { data: drivers, isLoading } = useCollection<UserProfile>(driversQuery)

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold">Actividad de Conductores</h1>
        <Card>
            <CardHeader>
                <CardTitle>Conductores Registrados ({drivers?.length ?? 0})</CardTitle>
                <CardDescription>Seleccioná un conductor para ver sus viajes y progreso semanal.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && <p>Cargando conductores...</p>}
                {!isLoading && drivers && drivers.length > 0 ? (
                     <ul className="space-y-3">
                        {drivers.map(driver => <DriverListItem key={driver.id} driver={driver} />)}
                    </ul>
                ) : !isLoading && (
                    <p className="text-center text-muted-foreground py-8">No hay conductores registrados.</p>
                )}
            </CardContent>
        </Card>
    </div>
  )
}
