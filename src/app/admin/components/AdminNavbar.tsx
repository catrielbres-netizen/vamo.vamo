
'use client'

import React from 'react';
import Link from 'next/link'
import { VamoIcon } from '@/components/VamoIcon'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/firebase'
import { signOut } from 'firebase/auth'
import { VamoLogo } from '@/components/branding/VamoLogo';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminAlertsCenter } from '@/components/admin/AdminAlertsCenter';

const navLinks = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: 'layout' },
    { href: '/admin/live-rides', label: 'Operativo En Vivo', icon: 'activity' },
    { href: '/admin/fraud', label: 'Control de Fraude', icon: 'shield-alert' },
    { href: '/admin/withdrawals', label: 'Finanzas & Retiros', icon: 'banknote' },
    { href: '/admin/simulator', label: 'Simulador Financiero', icon: 'line-chart' },
    { href: '/admin/drivers', label: 'Gestión de Flota', icon: 'users' },
    { href: '/admin/alerts', label: 'Pánico SOS', icon: 'volume-2' },
    { href: '/admin/claims', label: 'Asistencia Médica', icon: 'heart-pulse' },
    { href: '/admin/expansion', label: 'Expansión Hub', icon: 'trending-up' },
    { href: '/admin/promotions', label: 'Marketing', icon: 'megaphone' },
    { href: '/admin/config', label: 'Configuración', icon: 'settings' },
]

export function AdminNavbar() {
  const pathname = usePathname()
  const auth = useAuth()
  const router = useRouter()
  const { cityKey, setCityOverride } = useMunicipalContext();

  const handleLogout = async () => {
    if (auth) {
        await signOut(auth)
        router.push('/login')
    }
  }

  const handleCityChange = (newCity: string) => {
    setCityOverride(newCity);
    window.location.reload();
  };

  return (
    <nav className="flex items-center gap-6 border-b border-white/5 bg-black/40 backdrop-blur-md p-4 sticky top-0 z-20">
        <div className="flex items-center gap-2">
            <VamoIcon name="shield-check" className="h-6 w-6 text-primary" />
            <div className="hidden md:block">
               <VamoLogo variant="navbar" />
            </div>
            <span className="hidden md:inline font-black tracking-tighter text-white">ADMIN</span>
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">
            <VamoIcon name="map-pin" className="h-3.5 w-3.5 text-zinc-500" />
            <Select value={cityKey || "global"} onValueChange={handleCityChange}>
                <SelectTrigger className="w-[140px] h-8 bg-transparent border-none text-[11px] font-black uppercase tracking-widest text-white focus:ring-0 p-0">
                    <SelectValue placeholder="CIUDAD" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-white/10 text-white">
                    <SelectItem value="global" className="text-primary font-black">🌎 Todo VamO</SelectItem>
                    <SelectItem value="rawson">Rawson</SelectItem>
                    <SelectItem value="trelew">Trelew</SelectItem>
                    <SelectItem value="madryn">Madryn</SelectItem>
                    <SelectItem value="cordoba">Córdoba</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <Link href="/municipal/dashboard" className="px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-400 text-[10px] font-black uppercase hover:bg-indigo-600/20 transition-all border border-indigo-500/20">
            Ir a VamoMuni
        </Link>

        <div className="flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar ml-4">
            {navLinks.map(link => (
                <Link 
                    key={link.href}
                    href={link.href}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 whitespace-nowrap",
                        pathname.startsWith(link.href) ? "text-primary bg-primary/10" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <VamoIcon name={link.icon as any} className="h-4 w-4" />
                    {link.label}
                </Link>
            ))}
        </div>

        <div className="flex items-center gap-4">
            <AdminAlertsCenter cityKey={cityKey || undefined} />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-zinc-500">
                Cerrar Sesión
            </Button>
        </div>
    </nav>
  )
}
