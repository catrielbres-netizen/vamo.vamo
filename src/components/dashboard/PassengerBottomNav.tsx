'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function PassengerBottomNav() {
    const pathname = usePathname();
    const currentTab = pathname.split('/dashboard/')[1] || 'ride';
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Determine active state purely based on base paths
    const isActive = (path: string) => currentTab.startsWith(path);

    return (
        <>
            {/* Spacer to prevent content from hiding behind the bottom nav */}
            <div className="h-20 w-full" />
            
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 pb-safe">
                <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
                    <Link 
                        href="/dashboard/ride" 
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-full gap-1 transition-all",
                            isActive('ride') ? "text-blue-400 font-black" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <div className={cn("p-1.5 rounded-xl transition-all", isActive('ride') ? "bg-blue-400/10" : "")}>
                            <VamoIcon name="car" className={cn("w-5 h-5", isActive('ride') ? "text-blue-400" : "text-blue-400/50")} />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider">Inicio</span>
                    </Link>

                    <Link 
                        href="/dashboard/wallet" 
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-full gap-1 transition-all",
                            isActive('wallet') ? "text-emerald-400 font-black" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <div className={cn("p-1.5 rounded-xl transition-all", isActive('wallet') ? "bg-emerald-400/10" : "")}>
                            <VamoIcon name="wallet" className={cn("w-5 h-5", isActive('wallet') ? "text-emerald-400" : "text-emerald-400/50")} />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider">Billetera</span>
                    </Link>

                    <Link 
                        href="/dashboard/history" 
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-full gap-1 transition-all",
                            isActive('history') ? "text-amber-400 font-black" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <div className={cn("p-1.5 rounded-xl transition-all", isActive('history') ? "bg-amber-400/10" : "")}>
                            <VamoIcon name="clock" className={cn("w-5 h-5", isActive('history') ? "text-amber-400" : "text-amber-400/50")} />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider">Viajes</span>
                    </Link>

                    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                        <SheetTrigger asChild>
                            <button 
                                className={cn(
                                    "flex flex-col items-center justify-center w-full h-full gap-1 transition-all hover:text-foreground",
                                    (isActive('profile') || isActive('rewards')) ? "text-indigo-400 font-black" : "text-muted-foreground"
                                )}
                            >
                                <div className={cn("p-1.5 rounded-xl transition-all", (isActive('profile') || isActive('rewards')) ? "bg-indigo-400/10" : "")}>
                                    <VamoIcon name="user" className={cn("w-5 h-5", (isActive('profile') || isActive('rewards')) ? "text-indigo-400" : "text-indigo-400/50")} />
                                </div>
                                <span className="text-[10px] uppercase tracking-wider">Cuenta</span>
                            </button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="rounded-t-[32px] border-t-white/10 bg-zinc-950 p-6">
                            <SheetHeader className="mb-6 text-left">
                                <SheetTitle className="text-xl font-black uppercase tracking-tighter text-white">Mi Cuenta</SheetTitle>
                            </SheetHeader>
                            <div className="grid grid-cols-2 gap-3">
                                <Link onClick={() => setIsMenuOpen(false)} href="/dashboard/profile" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-white/5 active:scale-95 transition-all text-white hover:bg-zinc-800">
                                    <VamoIcon name="user" className="w-6 h-6 mb-2 text-indigo-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Mi Perfil</span>
                                </Link>
                                <Link onClick={() => setIsMenuOpen(false)} href="/dashboard/rewards" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-white/5 active:scale-95 transition-all text-white hover:bg-zinc-800">
                                    <VamoIcon name="gift" className="w-6 h-6 mb-2 text-pink-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Premios</span>
                                </Link>
                                <button onClick={() => {
                                    setIsMenuOpen(false);
                                    if ('serviceWorker' in navigator) {
                                        navigator.serviceWorker.getRegistrations().then(function(registrations) {
                                            for(let registration of registrations) {
                                                registration.unregister();
                                            }
                                        }).then(() => {
                                            window.location.reload();
                                        });
                                    } else {
                                        window.location.reload();
                                    }
                                }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-white/5 active:scale-95 transition-all text-white hover:bg-zinc-800">
                                    <VamoIcon name="rotate-ccw" className="w-6 h-6 mb-2 text-blue-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-center">Actualizar App</span>
                                </button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </>
    );
}
