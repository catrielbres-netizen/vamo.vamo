'use client'

import Link from 'next/link'
import { VamoIcon } from '@/components/icons'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Usuarios' },
    { href: '/admin/rides', label: 'Conductores' },
]

export function AdminNavbar() {
  const pathname = usePathname()

  // Helper to determine if a link is active, considering nested routes
  const isActive = (href: string) => {
    if (href === '/admin/rides') {
        return pathname.startsWith('/admin/rides') || pathname.startsWith('/admin/drivers');
    }
    return pathname === href;
  }

  return (
    <nav className="flex items-center gap-6 border-b bg-background p-4 sticky top-0 z-10">
        <Link href="/admin/dashboard" className="flex items-center gap-2 font-semibold">
            <VamoIcon className="h-6 w-6 text-primary" />
            <span className="hidden md:inline">Admin</span>
        </Link>
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
    </nav>
  )
}
