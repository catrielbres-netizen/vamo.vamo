
'use client'

import { AdminNavbar } from './components/AdminNavbar'
import { usePathname } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { useUser } from '@/firebase'
import { VamoIcon } from '@/components/VamoIcon'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  
  const authStatus = requireAdmin(profile, loading)

  useEffect(() => {
    // Si no está autorizado y no es la página de crear admin (que es pública si no hay admins)
    if (authStatus === 'unauthorized') {
        router.replace('/login')
    }
  },[authStatus, router])


  if (authStatus === 'loading') {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
            <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
            <p className="mt-4 text-muted-foreground">Verificando acceso...</p>
        </div>
    )
  }
  
  if (authStatus === 'unauthorized') {
      // Este estado se ve brevemente antes de que el useEffect redirija.
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
            <p className="mt-4 text-muted-foreground">Redirigiendo...</p>
        </div>
    )
  }

  // Si está autorizado, muestra el layout de admin completo
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
       <AdminNavbar />
       <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
