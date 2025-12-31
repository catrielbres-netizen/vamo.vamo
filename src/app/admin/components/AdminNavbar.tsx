'use client'

import Link from 'next/link'
import { VamoIcon } from '@/components/icons'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Usuarios' },
    { href: '/admin/rides', label: 'Viajes' },
    { href: '/admin/create', label: 'Crear Admin' },
]

export function AdminNavbar() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-6 border-b bg-background p-4 sticky top-0 z-10">
        <Link href="/admin/dashboard" className="flex items-center gap-2 font-semibold">
            <VamoIcon className="h-6 w-6 text-primary" />
            <span>Admin</span>
        </Link>
        {navLinks.map(link => (
            <Link 
                key={link.href}
                href={link.href}
                className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    pathname === link.href ? "text-primary" : "text-muted-foreground"
                )}
            >
                {link.label}
            </Link>
        ))}
    </nav>
  )
}
