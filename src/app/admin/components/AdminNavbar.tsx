
'use client'

import React from 'react';
import Link from 'next/link'
import { VamoIcon } from '@/components/VamoIcon'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/firebase'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'

const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/drivers', label: 'Conductores' },
    { href: '/admin/withdrawals', label: 'Finanzas' },
    { href: '/admin/live-rides', label: 'En Vivo' },
    { href: '/admin/claims', label: 'Asistencia' },
    { href: '/admin/benefits', label: 'Beneficios' },
    { href: '/admin/alerts', label: 'Alertas' },
    { href: '/admin/config', label: 'Configuración' },
]

export function AdminNavbar() {
  const pathname = usePathname()
  const auth = useAuth()
  const router = useRouter()

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  }

  const handleLogout = async () => {
    if (auth) {
        await signOut(auth)
        router.push('/login')
    }
  }

  return (
    <nav className="flex items-center gap-6 border-b border-white/5 bg-black/40 backdrop-blur-md p-4 sticky top-0 z-20">
        <div className="flex items-center gap-2">
            <VamoIcon name="shield-check" className="h-6 w-6 text-primary" />
            <span className="hidden md:inline font-black tracking-tighter text-white">ADMIN <span className="text-primary tracking-normal">VamO</span></span>
        </div>
        {navLinks.map(link => (
            <Link 
                key={link.href}
                href={link.href}
                className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    isActive(link.href) ? "text-primary" : "text-muted-foreground"
                )}
            >
                {link.label}
            </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
            <Button 
                variant="destructive" 
                size="sm" 
                onClick={async () => {
                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                    const functions = getFunctions(undefined, 'us-central1');
                    const seedPricingV1 = httpsCallable(functions, 'seedPricingV1');
                    try {
                        const result = await seedPricingV1();
                        alert('Seeding éxito: ' + JSON.stringify(result.data));
                    } catch (e: any) {
                        alert('Error: ' + e.message);
                    }
                }}
            >
                SEED PRICING
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
                <VamoIcon name="logout" className="mr-2 h-4 w-4" />
                Cerrar Sesión
            </Button>
        </div>
    </nav>
  )
}
