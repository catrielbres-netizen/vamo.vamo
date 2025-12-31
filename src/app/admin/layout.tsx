'use client'

import { useUser } from '@/firebase'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { requireAdmin } from '@/lib/auth/requireAdmin'

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

  return <>{children}</>
}