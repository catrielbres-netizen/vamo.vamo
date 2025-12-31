'use client'

import { useCollection, useMemoFirebase } from '@/firebase'
import { collection } from 'firebase/firestore'
import { useFirestore } from '@/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function AdminUsers() {
  const db = useFirestore()
  const usersQuery = useMemoFirebase(() => db ? collection(db, 'users') : null, [db]);
  const { data: users, isLoading } = useCollection(usersQuery)


  return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Usuarios</h1>
        
        <Card>
            <CardHeader>
                <CardTitle>Todos los Usuarios ({users?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
                 {isLoading && <p>Cargando usuarios...</p>}
                <ul className="space-y-3">
                {users?.map(user => (
                    <li key={user.id} className="border p-4 rounded-lg flex justify-between items-center">
                    <div>
                        <p className="font-semibold">{user.name ?? user.email}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">{user.role}</Badge>
                    </li>
                ))}
                </ul>
            </CardContent>
        </Card>

      </div>
  )
}
