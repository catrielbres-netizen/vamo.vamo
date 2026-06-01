'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

const navLinks = [
    { href: '/traffic',           label: 'Inicio',       icon: 'layout-dashboard' },
    { href: '/traffic/drivers',    label: 'Conductores',  icon: 'users' },
    { href: '/traffic/map',        label: 'Mapa en Vivo', icon: 'map' },
    { href: '/traffic/documents',  label: 'Documentos',   icon: 'file-text' },
];

export function TrafficNavbar() {
    const pathname = usePathname();
    const router = useRouter();
    const auth = useAuth();
    const { profile } = useUser();
    const { cityKey, setCityOverride, isGlobalAdmin } = useMunicipalContext();

    const handleLogout = async () => {
        if (auth) {
            await signOut(auth);
            router.push('/traffic/login');
        }
    };

    return (
        <nav className="flex items-center gap-2 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl px-6 py-4 sticky top-0 z-50">
            {/* BRAND */}
            <div className="flex items-center gap-3 mr-8">
                <div className="hidden md:block">
                    <VamoLogo variant="navbar" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 leading-none mb-1">VamO Control</p>
                    <p className="text-sm font-black text-white italic tracking-tighter leading-none">
                        TRÁNSITO {isGlobalAdmin ? (cityKey ? cityKey.toUpperCase() : 'GLOBAL') : (profile?.city?.toUpperCase() || 'JURISDICCIÓN')}
                    </p>
                </div>
            </div>

            {/* GLOBAL ADMIN CITY OVERRIDE */}
            {isGlobalAdmin && (
                <div className="mr-4 flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Jurisdicción:</span>
                    <select
                        value={cityKey || 'rawson'}
                        onChange={(e) => setCityOverride(e.target.value)}
                        className="bg-zinc-900 border border-white/5 rounded-lg text-xs font-bold uppercase tracking-wider text-zinc-300 py-1 px-2.5 focus:outline-none"
                    >
                        <option value="rawson">Rawson</option>
                        <option value="trelew">Trelew</option>
                    </select>
                </div>
            )}

            {/* LINKS */}
            <div className="flex items-center gap-1 flex-1">
                {navLinks.map(link => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            "flex items-center gap-2 px-4 h-10 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                            pathname === link.href || (link.href !== '/traffic' && pathname.startsWith(link.href))
                                ? "bg-white/10 text-white shadow-inner"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                        )}
                    >
                        <VamoIcon name={link.icon} className="h-4 w-4" />
                        {link.label}
                    </Link>
                ))}
            </div>

            {/* USER & LOGOUT */}
            <div className="flex items-center gap-4">
                <div className="hidden lg:flex flex-col items-end mr-2">
                    <p className="text-xs font-bold text-zinc-300">{profile?.name}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Inspector de Tránsito</p>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleLogout}
                    className="rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors"
                >
                    <VamoIcon name="log-out" className="w-5 h-5" />
                </Button>
            </div>
        </nav>
    );
}
