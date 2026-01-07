// src/app/admin/layout.tsx

export const dynamic = "force-dynamic";

import { AdminNavbar } from './components/AdminNavbar'
import { usePathname } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { useUser } from '@/firebase'
import { VamoIcon } from '@/components/VamoIcon'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Providers from '../providers'


// This is the Client Component that handles auth logic
function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  'use client';
  
  const { profile, loading } = useUser()
  const router = useRouter()
  
  const authStatus = requireAdmin(profile, loading)

  useEffect(() => {
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
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
            <p className="mt-4 text-muted-foreground">Redirigiendo...</p>
        </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
       <AdminNavbar />
       <main className="flex-1 p-6">{children}</main>
    </div>
  )
}

// This is the Layout, a Server Component
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AdminAuthWrapper>{children}</AdminAuthWrapper>
    </Providers>
  )
}
