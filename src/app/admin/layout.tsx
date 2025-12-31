'use client'

import { useUser } from '@/firebase'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { VamoIcon } from '@/components/icons'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { AdminNavbar } from './components/AdminNavbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser()
  const router = useRouter()

  const status = requireAdmin(profile, loading)

  useEffect(() => {
    if (status === 'unauthorized') {
      router.replace('/dashboard')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4">Verificando acceso de administrador...</p>
      </div>
    )
  }

  if (status !== 'authorized') {
    return null
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
       <AdminNavbar />
       <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
