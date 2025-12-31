'use client'

import { useUser } from '@/firebase'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { VamoIcon } from '@/components/icons'
import { AdminNavbar } from './components/AdminNavbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    // Esperar a que la carga finalice para tomar una decisión
    if (loading) {
      return;
    }

    // Si, después de cargar, no hay perfil O el rol no es 'admin',
    // entonces no está autorizado.
    if (!profile || profile.role !== 'admin') {
      router.replace('/dashboard'); // Redirige a una página segura por defecto
    }
  }, [profile, loading, router]);


  // Muestra un estado de carga mientras se verifica el perfil.
  // `loading` es true tanto durante la carga de auth como la del perfil.
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4">Verificando acceso de administrador...</p>
      </div>
    )
  }

  // Si ya terminó de cargar y el perfil no es de admin,
  // no renderiza nada para evitar un parpadeo del contenido no autorizado
  // mientras la redirección del useEffect hace su trabajo.
  if (!profile || profile.role !== 'admin') {
    return null
  }

  // Si pasó todas las verificaciones, es un admin autorizado.
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
       <AdminNavbar />
       <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
