'use client';

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { Badge } from '@/components/ui/badge';

interface SettlementSummary {
    cityKey: string;
    count: number;
    totalAmount: number;
    sources: { [key: string]: number };
}

export default function AdminMunicipalSettlements() {
    const db = useFirestore();
    const [loading, setLoading] = useState(true);
    const [summaries, setSummaries] = useState<SettlementSummary[]>([]);
    const [settling, setSettling] = useState<string | null>(null);

    const loadData = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const q = query(
                collection(db, 'municipal_ledger'),
                where('settlementStatus', '==', 'pending_transfer')
            );
            const snap = await getDocs(q);
            
            const cityMap: Record<string, SettlementSummary> = {};
            
            snap.docs.forEach(d => {
                const data = d.data();
                const city = data.cityKey || 'unknown';
                const amt = data.municipalShareAmount || 0;
                const source = data.source || 'other';

                if (!cityMap[city]) {
                    cityMap[city] = { cityKey: city, count: 0, totalAmount: 0, sources: {} };
                }
                
                cityMap[city].count += 1;
                cityMap[city].totalAmount += amt;
                cityMap[city].sources[source] = (cityMap[city].sources[source] || 0) + amt;
            });

            setSummaries(Object.values(cityMap));
        } catch (error) {
            console.error('Error loading settlements', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [db]);

    const handleSettle = async (cityKey: string) => {
        if (!db) return;
        if (!confirm(`¿Estás seguro de marcar como transferido el saldo de ${cityKey}?`)) return;

        setSettling(cityKey);
        try {
            const q = query(
                collection(db, 'municipal_ledger'),
                where('settlementStatus', '==', 'pending_transfer'),
                where('cityKey', '==', cityKey)
            );
            const snap = await getDocs(q);

            const batch = writeBatch(db);
            snap.docs.forEach(d => {
                batch.update(d.ref, {
                    settlementStatus: 'transferred',
                    transferredAt: serverTimestamp(),
                    transferredBy: 'admin_action'
                });
            });

            await batch.commit();
            alert('Liquidación registrada exitosamente.');
            loadData();
        } catch (error) {
            console.error(error);
            alert('Error procesando liquidación.');
        } finally {
            setSettling(null);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 pb-24">
            <div className="mb-8">
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Liquidaciones Municipales</h1>
                <p className="text-sm font-medium text-zinc-400">Consolidación de saldos recaudados por VamO en nombre de los Municipios.</p>
            </div>

            {loading ? (
                <div className="text-white">Cargando saldos...</div>
            ) : summaries.length === 0 ? (
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 text-center">
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">No hay saldos pendientes de transferencia.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {summaries.map(s => (
                        <div key={s.cityKey} className="bg-zinc-900 border border-white/5 rounded-[2rem] p-6 shadow-2xl flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase">{s.cityKey}</h3>
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">
                                    {s.count} viajes pendientes
                                </p>
                                <div className="flex gap-2 mt-4">
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Efectivo: ${s.sources['cash'] || 0}
                                    </Badge>
                                    <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                        Billetera: ${s.sources['wallet'] || 0}
                                    </Badge>
                                </div>
                            </div>
                            
                            <div className="text-right">
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">A Transferir</p>
                                <p className="text-4xl font-black text-indigo-400 mb-4">${s.totalAmount}</p>
                                <button
                                    onClick={() => handleSettle(s.cityKey)}
                                    disabled={settling === s.cityKey}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-[10px] px-6 py-3 rounded-xl transition-all shadow-lg"
                                >
                                    {settling === s.cityKey ? 'Procesando...' : 'Marcar como Transferido'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
