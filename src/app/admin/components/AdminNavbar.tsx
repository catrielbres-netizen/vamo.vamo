
'use client'

import Link from 'next/link'
import { VamoIcon } from '@/components/icons'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/firebase'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const LogOut = dynamic(() =>
  import("lucide-react").then(mod => mod.LogOut),
  { ssr: false }
);

const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Usuarios' },
    { href: '/admin/rides', label: 'Conductores' },
]

export function AdminNavbar() {
  const pathname = usePathname()
  const auth = useAuth()
  const router = useRouter()

  // Helper to determine if a link is active, considering nested routes
  const isActive = (href: string) => {
    if (href === '/admin/rides') {
        return pathname.startsWith('/admin/rides') || pathname.startsWith('/admin/drivers');
    }
    return pathname === href;
  }

  const handleLogout = async () => {
    if (auth) {
        await signOut(auth)
        router.push('/login')
    }
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
        <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
            </Button>
        </div>
    </nav>
  )
}
