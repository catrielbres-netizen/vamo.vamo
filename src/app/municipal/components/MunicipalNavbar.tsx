'use client'

import React from 'react';
import Link from 'next/link'
import { VamoIcon } from '@/components/VamoIcon'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth, useUser } from '@/firebase'
import { signOut } from 'firebase/auth'
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { CITIES } from '@/lib/cityData';
import { VamoLogo } from '@/components/branding/VamoLogo';

const navLinks = [
    { href: '/municipal/dashboard',  label: 'Dashboard',   icon: 'layout-dashboard' },
    { href: '/municipal/alerts',     label: 'Alertas',     icon: 'shield-alert' },
    { href: '/municipal/map',        label: 'Mapa',        icon: 'map' },
    { href: '/municipal/drivers',    label: 'Conductores', icon: 'users' },
    { href: '/municipal/passengers', label: 'Pasajeros',   icon: 'contact' },
    { href: '/traffic',              label: 'Tránsito',    icon: 'shield-check' },
    { href: '/municipal/treasury',   label: 'Tesorería',   icon: 'landmark' },
    { href: '/municipal/team',       label: 'Equipo',      icon: 'shield' },
    { href: '/municipal/pricing',    label: 'Tarifas',     icon: 'banknote' },
]

const HUB_CITY_KEY = 'rawson';

export function MunicipalNavbar() {
  const pathname  = usePathname()
  const auth      = useAuth()
  const router    = useRouter()
  const { profile } = useUser()
  const { cityKey: currentCityKey, cityName, setCityOverride, isGlobalAdmin, isMuniAdmin, isOperator, isTreasury, isTraffic } = useMunicipalContext();

  const filteredLinks = navLinks.filter(link => {
      if (link.href === '/municipal/team') return isMuniAdmin;
      if (link.href === '/municipal/pricing') return isMuniAdmin;
      if (link.href === '/municipal/drivers') return isOperator || isMuniAdmin;
      if (link.href === '/municipal/passengers') return isOperator || isMuniAdmin;
      if (link.href === '/municipal/alerts') return isTraffic || isOperator || isMuniAdmin;
      if (link.href === '/municipal/treasury') return isTreasury || isMuniAdmin;
      if (link.href === '/municipal/traffic') return isTraffic || isMuniAdmin;
      return true;
  });

  const currentCityName = cityName;

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCityOverride(e.target.value);
    window.location.reload();
  };

  const handleLogout = async () => {
    if (auth) { await signOut(auth); router.push('/municipal/login'); }
  }

  return (
    <div className="flex flex-col h-full py-8">
        <div className="px-8 mb-10">
            <div className="flex flex-col items-start gap-2">
                <VamoLogo variant="navbar" />
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1 mt-1">Muni <span className="text-white">{currentCityName}</span></p>
            </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
            {filteredLinks.map(link => (
                <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    className={cn(
                        "flex items-center gap-3 px-6 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                        pathname.startsWith(link.href)
                            ? "bg-[#1D7CFF] text-white shadow-lg shadow-[#1D7CFF]/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    )}
                >
                    <VamoIcon name={link.icon as any} className="h-4 w-4" />
                    <span>{link.label}</span>
                </Link>
            ))}
        </nav>

        <div className="px-4 pt-4 mt-4 border-t border-white/5 space-y-2">
            {profile?.role === 'admin' && (
                <Link
                    href="/admin/dashboard"
                    className="flex items-center gap-3 px-6 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-zinc-900 text-zinc-500 hover:text-white border border-white/5 transition-all"
                >
                    <VamoIcon name="shield-check" className="h-4 w-4" />
                    Central
                </Link>
            )}
            <Button 
                variant="ghost" 
                onClick={handleLogout} 
                className="w-full justify-start gap-3 px-6 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
            >
                <VamoIcon name="log-out" className="h-4 w-4" />
                <span>Salir</span>
            </Button>
        </div>
    </div>
  )
}
