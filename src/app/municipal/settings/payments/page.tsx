'use client';

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { useUser } from '@/firebase';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';

interface MunicipalAccountForm {
    paymentProvider: 'mercado_pago' | 'bank_transfer' | 'manual';
    mercadoPagoAccountId: string;
    mercadoPagoEmail: string;
    bankAlias: string;
    cbu: string;
    cuit: string;
    accountHolderName: string;
    enabled: boolean;
}

export default function MunicipalSettingsPayments() {
    const db = useFirestore();
    const { cityKey } = useMunicipalContext();
    const { profile } = useUser();
    const role = profile?.role;
    const telemetry = useTelemetry();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<MunicipalAccountForm>({
        paymentProvider: 'bank_transfer',
        mercadoPagoAccountId: '',
        mercadoPagoEmail: '',
        bankAlias: '',
        cbu: '',
        cuit: '',
        accountHolderName: '',
        enabled: false
    });

    useEffect(() => {
        if (!db || !cityKey) return;
        
        getDoc(doc(db, 'municipal_accounts', cityKey)).then(snap => {
            if (snap.exists()) {
                const data = snap.data() as any;
                setFormData({
                    paymentProvider: data.paymentProvider || 'bank_transfer',
                    mercadoPagoAccountId: data.mercadoPagoAccountId || '',
                    mercadoPagoEmail: data.mercadoPagoEmail || '',
                    bankAlias: data.bankAlias || '',
                    cbu: data.cbu || '',
                    cuit: data.cuit || '',
                    accountHolderName: data.accountHolderName || '',
                    enabled: data.enabled || false
                });
            }
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [db, cityKey]);

    const handleSave = async () => {
        if (!db || !cityKey) return;
        if (role !== 'municipal_admin' && role !== 'admin' && role !== 'superadmin') {
            alert('No tienes permisos suficientes.');
            return;
        }

        setSaving(true);
        try {
            await setDoc(doc(db, 'municipal_accounts', cityKey), {
                ...formData,
                cityKey,
                municipalityName: cityKey.toUpperCase(),
                mercadoPagoLinked: !!formData.mercadoPagoAccountId,
                updatedAt: serverTimestamp(),
                updatedBy: profile?.id || 'unknown'
            }, { merge: true });

            telemetry.trackEvent({
                type: 'municipal_operation',
                eventName: 'municipal_account_updated',
                metadata: { cityKey, provider: formData.paymentProvider }
            });

            alert('Configuración guardada exitosamente.');
        } catch (error) {
            console.error('Error saving account config:', error);
            alert('Error al guardar la configuración.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-white">Cargando...</div>;

    const canEdit = role === 'municipal_admin' || role === 'admin' || role === 'superadmin';

    return (
        <div className="max-w-4xl mx-auto p-6 pb-24">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                        <VamoIcon name="briefcase" className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Cuenta de Cobro Municipal</h1>
                        <p className="text-sm font-medium text-zinc-400">Configura la cuenta para percibir las comisiones de VamO.</p>
                    </div>
                </div>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                {!canEdit && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-10 flex items-center justify-center">
                        <Badge className="bg-rose-500 text-white uppercase text-xs">Modo Solo Lectura</Badge>
                    </div>
                )}
                
                <div className="space-y-6 relative z-0">
                    <div className="flex items-center justify-between border-b border-white/10 pb-6">
                        <div>
                            <h3 className="text-white font-bold">Estado de la cuenta</h3>
                            <p className="text-xs text-zinc-400">Habilitar la recepción automática (cuando esté disponible el split).</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={formData.enabled}
                                onChange={e => setFormData(f => ({ ...f, enabled: e.target.checked }))}
                            />
                            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                        </label>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Método de liquidación</label>
                        <select 
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                            value={formData.paymentProvider}
                            onChange={e => setFormData(f => ({ ...f, paymentProvider: e.target.value as any }))}
                        >
                            <option value="bank_transfer">Transferencia Bancaria (Acumulación)</option>
                            <option value="mercado_pago">Mercado Pago (Split Directo VamO)</option>
                            <option value="manual">Liquidación Manual</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Titular de la cuenta</label>
                            <input 
                                type="text"
                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                value={formData.accountHolderName}
                                onChange={e => setFormData(f => ({ ...f, accountHolderName: e.target.value }))}
                                placeholder="Municipalidad de..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">CUIT</label>
                            <input 
                                type="text"
                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono"
                                value={formData.cuit}
                                onChange={e => setFormData(f => ({ ...f, cuit: e.target.value }))}
                                placeholder="30-XXXXXXXX-X"
                            />
                        </div>

                        {formData.paymentProvider === 'bank_transfer' && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">CBU / CVU</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono"
                                        value={formData.cbu}
                                        onChange={e => setFormData(f => ({ ...f, cbu: e.target.value }))}
                                        placeholder="22 números"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Alias</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono"
                                        value={formData.bankAlias}
                                        onChange={e => setFormData(f => ({ ...f, bankAlias: e.target.value }))}
                                        placeholder="MUNI.RAWSON.VAMO"
                                    />
                                </div>
                            </>
                        )}

                        {formData.paymentProvider === 'mercado_pago' && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Email Cuenta Mercado Pago</label>
                                    <input 
                                        type="email"
                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                        value={formData.mercadoPagoEmail}
                                        onChange={e => setFormData(f => ({ ...f, mercadoPagoEmail: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">ID de Cuenta Mercado Pago</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono"
                                        value={formData.mercadoPagoAccountId}
                                        onChange={e => setFormData(f => ({ ...f, mercadoPagoAccountId: e.target.value }))}
                                        placeholder="Obligatorio para Split"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="pt-6 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs px-8 py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                        >
                            {saving ? 'Guardando...' : 'Guardar Configuración'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
