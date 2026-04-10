'use client'

import React from 'react';
import Link from 'next/link'
import { VamoIcon } from '@/components/VamoIcon'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth, useUser } from '@/firebase'
import { signOut } from 'firebase/auth'

const navLinks = [
    { href: '/municipal/dashboard',  label: 'Dashboard',   icon: 'layout-dashboard' },
    { href: '/municipal/drivers',    label: 'Conductores', icon: 'users' },
    { href: '/municipal/pricing',    label: 'Tarifas',     icon: 'banknote' },
]

const HUB_CITY_KEY = 'rawson';

export function MunicipalNavbar() {
  const pathname  = usePathname()
  const auth      = useAuth()
  const router    = useRouter()
  const { profile } = useUser()

  const handleLogout = async () => {
    if (auth) { await signOut(auth); router.push('/municipal/login'); }
  }

  return (
    <nav className="flex items-center gap-1 border-b border-zinc-800 bg-[#0d0d0d] px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mr-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <VamoIcon name="landmark" className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="hidden md:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">VamoMuni</p>
                <p className="text-[9px] text-zinc-600 -mt-0.5">{profile?.city ?? 'Portal Municipal'}</p>
            </div>
        </div>
        <div className="flex items-center gap-1 flex-1">
            {navLinks.map(link => (
                <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    className={cn(
                        "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors",
                        pathname.startsWith(link.href)
                            ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    )}
                >
                    <VamoIcon name={link.icon as any} className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{link.label}</span>
                </Link>
            ))}
            {profile?.cityKey === HUB_CITY_KEY && (
                <Link
                    href={'/municipal/expansion'}
                    prefetch={false}
                    className={cn(
                        "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors",
                        pathname.startsWith('/municipal/expansion')
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    )}
                >
                    <VamoIcon name="map" className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-[9px] uppercase tracking-tighter">Expansión HUB</span>
                </Link>
            )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-zinc-600 hover:text-zinc-300 text-xs h-8">
            <VamoIcon name="log-out" className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Salir</span>
        </Button>
    </nav>
  )
}
