'use client'

import { useCollection } from '@/firebase'
import { collection } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMemo } from 'react'
import { UserProfile } from '@/lib/types'
import { WithId } from '@/firebase/firestore/use-collection'
import { useMemoFirebase } from '@/firebase/provider'

const UserListItem = ({ user }: { user: WithId<UserProfile> }) => (
    <li className="border p-4 rounded-lg flex justify-between items-center">
        <div>
            <p className="font-semibold">{user.name ?? user.email}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">{user.role || 'Sin rol'}</Badge>
    </li>
);

export default function AdminUsers() {
  const db = useFirestore()
  const usersQuery = useMemoFirebase(() => db ? collection(db, 'users') : null, [db]);
  const { data: users, isLoading } = useCollection<UserProfile>(usersQuery)

  const { drivers, passengers } = useMemo(() => {
    const drivers: WithId<UserProfile>[] = [];
    const passengers: WithId<UserProfile>[] = [];
    users?.forEach(user => {
        if (user.role === 'driver') {
            drivers.push(user);
        } else if (user.role === 'passenger') {
            passengers.push(user);
        }
    });
    return { drivers, passengers };
  }, [users]);


  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Usuarios</h1>
        
        {isLoading && <p>Cargando usuarios...</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Conductores ({isLoading ? '...' : drivers.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {!isLoading && drivers.length > 0 ? (
                        <ul className="space-y-3">
                            {drivers.map(user => <UserListItem key={user.id} user={user} />)}
                        </ul>
                    ) : !isLoading ? (
                        <p className="text-muted-foreground">No hay conductores registrados.</p>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Pasajeros ({isLoading ? '...' : passengers.length})</CardTitle>
                </CardHeader>
                <CardContent>
                     {!isLoading && passengers.length > 0 ? (
                        <ul className="space-y-3">
                            {passengers.map(user => <UserListItem key={user.id} user={user} />)}
                        </ul>
                    ) : !isLoading ? (
                        <p className="text-muted-foreground">No hay pasajeros registrados.</p>
                    ) : null}
                </CardContent>
            </Card>
        </div>
      </div>
  )
}
