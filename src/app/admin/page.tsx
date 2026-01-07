// src/app/admin/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation'
import { useUser } from '@/firebase'

export default function AdminIndex() {
  const router = useRouter()
  const { profile, loading } = useUser()

  useEffect(() => {
    if(loading) return;

    if(profile?.role === 'admin') {
      router.replace('/admin/dashboard')
    } else {
      router.replace('/login')
    }
  }, [router, profile, loading])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <p className="mt-4 text-muted-foreground">Cargando...</p>
    </div>
  )
}
