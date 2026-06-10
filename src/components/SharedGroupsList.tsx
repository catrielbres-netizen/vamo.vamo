import React from 'react';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';


interface SharedGroupItem {
    groupId: string;
    distanceToPickupM: number;
    compatibilityScore: number;
    passengerCount: number;
    maxPassengers: number;
    expiresAt: any;
    estimatedDelayMin: number;
    approximateDestinationLabel: string;
}

interface SharedGroupsListProps {
    groups: SharedGroupItem[];
    onJoin: (groupId: string) => void;
    onCreateNew: () => void;
    onRefresh: () => void;
    isJoining: boolean;
    isRefreshing?: boolean;
    baseFare?: number | null;
}

export function SharedGroupsList({ groups, onJoin, onCreateNew, onRefresh, isJoining, isRefreshing, baseFare }: SharedGroupsListProps) {
    const fmt = (v: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v);
    
    const getDynamicSharedFare = (fare: number, currentPaxCount: number) => {
        const expectedCount = Math.min(4, (currentPaxCount || 1) + 1);
        let factor = 1.0;
        if (expectedCount === 2) factor = 0.68;
        else if (expectedCount === 3) factor = 0.60;
        else if (expectedCount >= 4) factor = 0.55;
        
        const raw = fare * factor;
        let rounded = Math.ceil(raw / 100) * 100;
        if (rounded >= fare) rounded = Math.max(100, Math.floor(raw / 100) * 100);
        if (rounded >= fare) rounded = Math.max(100, fare - 100);
        return rounded;
    };

    const potentialSharedFare = baseFare ? getDynamicSharedFare(baseFare, 1) : 0;
    const potentialSavings = baseFare ? baseFare - potentialSharedFare : 0;

    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/50 rounded-2xl border border-zinc-800 text-center">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                    <VamoIcon name="users" className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">No hay viajes compartidos cerca de tu origen por ahora.</h3>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Iniciá tu propio grupo para que otros pasajeros compatibles puedan sumarse y ahorrar hasta un 40%.</p>
                
                <div className="grid gap-3 w-full">
                    <button 
                        onClick={onCreateNew}
                        disabled={isJoining || isRefreshing || !baseFare}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg text-sm border border-white/10 flex flex-col items-center gap-1"
                    >
                        {isJoining ? (
                            <div className="flex items-center gap-2">
                                <VamoIcon name="loader" className="w-4 h-4 animate-spin" />
                                <span>Creando grupo...</span>
                            </div>
                        ) : (
                            <>
                                <span>Crear mi propio grupo</span>
                                {baseFare && (
                                    <span className="text-[10px] opacity-70 font-bold lowercase tracking-normal">
                                        por solo {fmt(potentialSharedFare)} al completarse (ahorrás {fmt(potentialSavings)})
                                    </span>
                                )}
                            </>
                        )}
                    </button>
                    <button 
                        onClick={onRefresh}
                        disabled={isJoining || isRefreshing}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 text-zinc-400 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                    >
                        <VamoIcon name="loader" className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
                        {isRefreshing ? 'Buscando...' : 'Actualizar lista'}
                    </button>
                </div>

                <div className="px-4 py-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex flex-col gap-1 mt-4 w-full text-left">
                    <div className="flex items-center gap-1.5 text-indigo-400 font-black text-[10px] uppercase tracking-wider">
                        <VamoIcon name="shield-check" className="w-3.5 h-3.5 shrink-0" />
                        <span>Tarifa compartida aplicada</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 italic leading-snug">
                        Los beneficios personales no son acumulables con VamO Compartido.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-white/60 font-bold text-xs uppercase tracking-widest">Viajes compartidos cerca de vos</h3>
                <button 
                    onClick={onRefresh}
                    disabled={isJoining || isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-400 font-bold transition-colors border border-white/5"
                >
                    <VamoIcon name="loader" className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
                    {isRefreshing ? '...' : 'Actualizar'}
                </button>
            </div>

            <div className="grid gap-3">
                {groups.map((group) => (
                    <button
                        key={group.groupId}
                        onClick={() => onJoin(group.groupId)}
                        disabled={isJoining || isRefreshing}
                        className="w-full text-left p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl transition-all group active:scale-[0.98]"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                                    <VamoIcon name="users" className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div>
                                    <div className="text-white font-bold text-sm">Hacia {group.approximateDestinationLabel}</div>
                                    <div className="text-zinc-500 text-[10px] flex items-center gap-1">
                                        <VamoIcon name="map-pin" className="w-3 h-3" />
                                        Punto de encuentro a {
                                            group.distanceToPickupM < 1000 
                                                ? `${Math.round(group.distanceToPickupM)} m` 
                                                : `${(group.distanceToPickupM / 1000).toFixed(1).replace('.', ',')} km`
                                        }
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="px-2 py-1 bg-zinc-800 rounded-lg text-white font-black text-[10px] border border-zinc-700">
                                    {group.passengerCount}/{group.maxPassengers} PAX
                                </div>
                                <div className="text-[9px] text-zinc-500 mt-1 font-bold uppercase tracking-tighter">
                                    {group.estimatedDelayMin <= 2 ? 'Rápido' : `+${group.estimatedDelayMin} min`}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                            <div className="flex items-center gap-2">
                                <div className="flex -space-x-2">
                                    {[...Array(Math.max(0, group.passengerCount || 1))].map((_, i) => (
                                        <div key={`pax-${i}`} className="w-5 h-5 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center overflow-hidden">
                                            <VamoIcon name="user" className="w-3 h-3 text-zinc-500" />
                                        </div>
                                    ))}
                                    {[...Array(Math.max(0, (group.maxPassengers || 4) - (group.passengerCount || 1)))].map((_, i) => (
                                        <div key={`empty-${i}`} className="w-5 h-5 rounded-full bg-zinc-900 border-2 border-zinc-900 border-dashed border-zinc-800" />
                                    ))}
                                </div>
                                <span className="text-[10px] text-zinc-500 font-bold">Unirse ahora</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <div className="text-emerald-400 font-black text-xs flex items-center gap-1.5">
                                    <VamoIcon name="trending-up" className="w-3 h-3" />
                                    <span>{fmt(baseFare ? getDynamicSharedFare(baseFare, group.passengerCount) : 0)}</span>
                                </div>
                                {baseFare && (
                                    <div className="text-[9px] text-emerald-400/60 font-bold">
                                        Ahorrás {fmt(baseFare - getDynamicSharedFare(baseFare, group.passengerCount))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            <button 
                onClick={onCreateNew}
                disabled={isJoining || isRefreshing || !baseFare}
                className="w-full py-4 border-2 border-dashed border-zinc-800 hover:border-zinc-700 text-zinc-500 hover:text-zinc-400 font-bold rounded-xl transition-all flex flex-col items-center justify-center gap-0.5"
            >
                {isJoining ? (
                    <div className="flex items-center gap-2">
                        <VamoIcon name="loader" className="w-3 h-3 animate-spin" />
                        <span>Procesando...</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <VamoIcon name="plus" className="w-4 h-4" />
                            <span>O iniciar mi propio grupo</span>
                        </div>
                        {baseFare && (
                            <span className="text-[9px] opacity-60">
                                por solo {fmt(potentialSharedFare)} al completarse
                            </span>
                        )}
                    </>
                )}
            </button>
            
            <div className="px-4 py-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-indigo-400 font-black text-[10px] uppercase tracking-wider">
                    <VamoIcon name="shield-check" className="w-3.5 h-3.5 shrink-0" />
                    <span>Tarifa compartida aplicada</span>
                </div>
                <p className="text-[10px] text-zinc-400 italic leading-snug">
                    Los beneficios personales no son acumulables con VamO Compartido.
                </p>
            </div>

            <div className="px-4 py-3 bg-amber-900/10 border border-amber-900/20 rounded-xl">
                <p className="text-[10px] text-amber-500/80 leading-relaxed">
                    <span className="font-bold">Aviso Beta:</span> Al unirte a un viaje compartido, aceptas posibles desvíos y esperas de hasta 12 minutos para que otros pasajeros se sumen.
                </p>
            </div>
        </div>
    );
}
