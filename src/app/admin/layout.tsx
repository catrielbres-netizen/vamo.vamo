'use client'

import { useUser } from '@/firebase'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import AdminSidebar from '@/components/AdminSidebar'

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
    return <div className="p-4">Cargando panel admin…</div>
  }

  if (status !== 'authorized') {
    return null
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <AdminSidebar />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
            {children}
        </main>
      </div>
    </div>
  )
}
