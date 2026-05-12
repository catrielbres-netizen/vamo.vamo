'use client';

import React, { useState, useMemo } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { safeFixed } from '@/lib/formatters';

// --- Types ---
interface SimulatorState {
    // 1. Conductores
    driverCount: number;
    premiumPercent: number;
    acceptanceRate: number;
    cancellationRate: number;

    // 2. Pasajeros
    activePassengers: number;
    ridesPerPassengerPerDay: number;
    avgTicket: number;

    // 3. Pricing (not used directly in this simplified model, but could be)
    // baseFare: number;
    // pricePerKm: number;

    // 4. Comisión
    commissionPremium: number;
    commissionExpress: number;

    // 5. Promociones & Bonos
    passengerDiscountAvg: number;
    driverBonusPerRide: number;
    rideSubsidies: number;

    // 6. Costos
    infraMonthlyCost: number; // Base Firebase + Maps
    costPerRequest: number; // Avg cost per ride in APIs/Functions

    // 7. FAP & Muni
    fapRate: number; // Internal fund (Express only)
    muniRate: number; // 2% Municipal
}

const INITIAL_STATE: SimulatorState = {
    driverCount: 50,
    premiumPercent: 20,
    acceptanceRate: 85,
    cancellationRate: 10,
    activePassengers: 1000,
    ridesPerPassengerPerDay: 0.1,
    avgTicket: 2500,
    commissionPremium: 8,
    commissionExpress: 16,
    passengerDiscountAvg: 200,
    driverBonusPerRide: 150,
    rideSubsidies: 50,
    infraMonthlyCost: 50000,
    costPerRequest: 15,
    fapRate: 2, // 2% of Express goes to FAP (internal)
    muniRate: 2, // 2% of Express goes to Municipality
};

export default function FinancialSimulatorPage() {
    const [state, setState] = useState<SimulatorState>(INITIAL_STATE);

    const results = useMemo(() => {
        // Daily Calculations
        const totalPotentialRides = state.activePassengers * state.ridesPerPassengerPerDay;
        const acceptedRides = totalPotentialRides * (state.acceptanceRate / 100);
        const finalRides = acceptedRides * (1 - state.cancellationRate / 100);

        const expressRides = finalRides * (1 - state.premiumPercent / 100);
        const premiumRides = finalRides * (state.premiumPercent / 100);

        const totalRevenue = finalRides * state.avgTicket;

        // Commissions
        const commExpress = expressRides * state.avgTicket * (state.commissionExpress / 100);
        const commPremium = premiumRides * state.avgTicket * (state.commissionPremium / 100);
        const totalGrossCommission = commExpress + commPremium;

        // Deductions from Commission
        const muniContribution = expressRides * state.avgTicket * (state.muniRate / 100);
        const fapFund = expressRides * state.avgTicket * (state.fapRate / 100);
        
        // VamO Net Revenue (before promo/costs)
        const vamoNetCommission = totalGrossCommission - muniContribution - fapFund;

        // Costs
        const promoCost = finalRides * state.passengerDiscountAvg;
        const bonusCost = finalRides * state.driverBonusPerRide;
        const subsidyCost = finalRides * state.rideSubsidies;
        const apiCost = finalRides * state.costPerRequest;
        const infraDaily = state.infraMonthlyCost / 30;

        const totalDailyCosts = promoCost + bonusCost + subsidyCost + apiCost + infraDaily;

        const dailyNetResult = vamoNetCommission - totalDailyCosts;

        // Metrics
        const margin = totalRevenue > 0 ? (dailyNetResult / totalRevenue) * 100 : 0;
        const profitPerRide = finalRides > 0 ? dailyNetResult / finalRides : 0;
        const breakEvenRides = (totalDailyCosts + muniContribution + fapFund) / (state.avgTicket * (state.commissionExpress / 100)); // Simplified for Express

        return {
            finalRides,
            totalRevenue,
            totalGrossCommission,
            muniContribution,
            fapFund,
            vamoNetCommission,
            promoCost,
            bonusCost,
            totalDailyCosts,
            dailyNetResult,
            margin,
            profitPerRide,
            breakEvenRides
        };
    }, [state]);

    const update = (key: keyof SimulatorState, val: number) => {
        setState(s => ({ ...s, [key]: val }));
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            <div>
                <h1 className="text-3xl font-black text-white">Simulador Financiero & Operativo</h1>
                <p className="text-zinc-500 text-sm mt-1">Modelo de rentabilidad proyectado para Rawson / Playa Unión</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                {/* --- CONTROLES --- */}
                <div className="xl:col-span-2 space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                        
                        {/* Conductores */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Flota y Operación</h3>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Conductores Activos</Label>
                                    <span className="text-white font-bold">{state.driverCount}</span>
                                </div>
                                <Slider value={[state.driverCount]} min={10} max={500} step={10} onValueChange={([v]) => update('driverCount', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">% Flota Premium (Taxis/Remis)</Label>
                                    <span className="text-white font-bold">{state.premiumPercent}%</span>
                                </div>
                                <Slider value={[state.premiumPercent]} min={0} max={100} step={5} onValueChange={([v]) => update('premiumPercent', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Tasa de Aceptación</Label>
                                    <span className="text-white font-bold">{state.acceptanceRate}%</span>
                                </div>
                                <Slider value={[state.acceptanceRate]} min={50} max={100} step={1} onValueChange={([v]) => update('acceptanceRate', v)} />
                            </div>
                        </div>

                        {/* Demanda */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400">Demanda (Pasajeros)</h3>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Usuarios Activos (Ciudad)</Label>
                                    <span className="text-white font-bold">{state.activePassengers}</span>
                                </div>
                                <Slider value={[state.activePassengers]} min={100} max={20000} step={100} onValueChange={([v]) => update('activePassengers', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Viajes/Día por Usuario</Label>
                                    <span className="text-white font-bold">{state.ridesPerPassengerPerDay}</span>
                                </div>
                                <Slider value={[state.ridesPerPassengerPerDay]} min={0.01} max={0.5} step={0.01} onValueChange={([v]) => update('ridesPerPassengerPerDay', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Ticket Promedio ($)</Label>
                                    <span className="text-white font-bold">${state.avgTicket}</span>
                                </div>
                                <Slider value={[state.avgTicket]} min={1000} max={8000} step={100} onValueChange={([v]) => update('avgTicket', v)} />
                            </div>
                        </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                        
                        {/* Incentivos */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-amber-400">Promociones e Incentivos</h3>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Descuento promedio/viaje</Label>
                                    <span className="text-white font-bold">${state.passengerDiscountAvg}</span>
                                </div>
                                <Slider value={[state.passengerDiscountAvg]} min={0} max={1000} step={50} onValueChange={([v]) => update('passengerDiscountAvg', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Bono conductor/viaje</Label>
                                    <span className="text-white font-bold">${state.driverBonusPerRide}</span>
                                </div>
                                <Slider value={[state.driverBonusPerRide]} min={0} max={1000} step={50} onValueChange={([v]) => update('driverBonusPerRide', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Subsidio VamO/viaje</Label>
                                    <span className="text-white font-bold">${state.rideSubsidies}</span>
                                </div>
                                <Slider value={[state.rideSubsidies]} min={0} max={500} step={10} onValueChange={([v]) => update('rideSubsidies', v)} />
                            </div>
                        </div>

                        {/* Comisiones */}
                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Comisiones y Tasas</h3>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Comisión Express (Total %)</Label>
                                    <span className="text-white font-bold">{state.commissionExpress}%</span>
                                </div>
                                <Slider value={[state.commissionExpress]} min={5} max={30} step={1} onValueChange={([v]) => update('commissionExpress', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Participación Municipal (%)</Label>
                                    <span className="text-white font-bold text-indigo-400">{state.muniRate}%</span>
                                </div>
                                <Slider value={[state.muniRate]} min={0} max={10} step={0.5} onValueChange={([v]) => update('muniRate', v)} />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-zinc-400">Reserva F.A.P. Interna (%)</Label>
                                    <span className="text-white font-bold text-zinc-500">{state.fapRate}%</span>
                                </div>
                                <Slider value={[state.fapRate]} min={0} max={5} step={0.5} onValueChange={([v]) => update('fapRate', v)} />
                            </div>
                        </div>

                    </div>
                </div>

                {/* --- RESULTADOS --- */}
                <div className="space-y-6">
                    
                    <div className={cn(
                        "rounded-3xl border p-8 space-y-6 shadow-2xl transition-all",
                        results.dailyNetResult >= 0 ? "bg-emerald-950/20 border-emerald-500/30" : "bg-red-950/20 border-red-500/30"
                    )}>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Resultado Neto Estimado (Día)</p>
                            <h2 className={cn(
                                "text-5xl font-black tracking-tighter",
                                results.dailyNetResult >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                                {results.dailyNetResult < 0 ? '-' : ''}${Math.abs(Math.round(results.dailyNetResult)).toLocaleString('es-AR')}
                            </h2>
                            <p className="text-[10px] text-zinc-600 mt-1 uppercase font-bold tracking-widest">
                                Proyección mensual: ${Math.round(results.dailyNetResult * 30).toLocaleString('es-AR')}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase text-zinc-500">Margen</p>
                                <p className={cn("text-xl font-bold", results.margin >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {safeFixed(results.margin, 1)}%
                                </p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[9px] font-black uppercase text-zinc-500">Viajes Reales</p>
                                <p className="text-xl font-bold text-white">{Math.round(results.finalRides)}</p>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Recaudación Total</span>
                                <span className="text-zinc-300 font-medium">${Math.round(results.totalRevenue).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Comisión VamO (Neto)</span>
                                <span className="text-zinc-300 font-medium">${Math.round(results.vamoNetCommission).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Aporte Municipal (Mensual)</span>
                                <span className="text-indigo-400 font-bold">${Math.round(results.muniContribution * 30).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Reserva F.A.P. (Mensual)</span>
                                <span className="text-zinc-400 font-bold">${Math.round(results.fapFund * 30).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between text-xs border-t border-white/5 pt-4">
                                <span className="text-zinc-500 font-bold">Costos Operativos (Mensual)</span>
                                <span className="text-red-400 font-bold">-${Math.round(results.totalDailyCosts * 30).toLocaleString('es-AR')}</span>
                            </div>
                        </div>

                        {results.dailyNetResult < 0 && (
                            <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 flex gap-3">
                                <VamoIcon name="alert-circle" className="h-5 w-5 text-red-500 shrink-0" />
                                <p className="text-[10px] text-red-400 font-bold uppercase leading-tight">
                                    Modelo no rentable con los parámetros actuales. Reducir bonos o aumentar ticket promedio.
                                </p>
                            </div>
                        )}
                        {results.margin > 20 && (
                            <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex gap-3">
                                <VamoIcon name="trending-up" className="h-5 w-5 text-emerald-500 shrink-0" />
                                <p className="text-[10px] text-emerald-400 font-bold uppercase leading-tight">
                                    Rentabilidad saludable detectada. Oportunidad para aumentar bonos de captación.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Breakdown de Costos */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Distribución de Costos</h3>
                        <div className="space-y-4">
                            <CostBar label="Promociones (Pasajeros)" value={results.promoCost} total={results.totalDailyCosts} />
                            <CostBar label="Bonos (Conductores)" value={results.bonusCost} total={results.totalDailyCosts} />
                            <CostBar label="Infraestructura & APIs" value={results.totalDailyCosts - results.promoCost - results.bonusCost} total={results.totalDailyCosts} />
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}

function CostBar({ label, value, total }: { label: string, value: number, total: number }) {
    const percent = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-300">${Math.round(value).toLocaleString('es-AR')} ({safeFixed(percent, 0)}%)</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
}
