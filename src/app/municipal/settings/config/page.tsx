'use client';

import React, { useEffect, useState } from 'react';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VamoIcon } from '@/components/VamoIcon';
import { MunicipalChecklistKey } from '@/lib/types';

const CHECKLIST_LABELS: Record<MunicipalChecklistKey, string> = {
    dniFront:               'DNI - Frente',
    dniBack:                'DNI - Dorso',
    driverLicense:          'Licencia de conducir',
    vehicleInsurance:       'Seguro del vehículo',
    passengerCoverageInsurance: 'Cobertura pasajeros - Seguros',
    vehicleRegistrationCard:'Cédula del vehículo',
    criminalRecord:         'Antecedentes penales vigentes',
    municipalCanon:         'Canon municipal (arancel)',
    disinfectionReceipt:    'Certificado de Desinfección',
    vehicleModelYearProof:  'Comprobante de modelo/año del vehículo',
};

const CHECKLIST_KEYS = Object.keys(CHECKLIST_LABELS) as MunicipalChecklistKey[];

export default function MunicipalConfigPage() {
    const { cityKey, cityName } = useMunicipalContext();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    type DriverRequirements = Record<MunicipalChecklistKey, boolean>;
    const defaultReqs = {} as DriverRequirements;
    CHECKLIST_KEYS.forEach(k => defaultReqs[k] = true);

    // Requirements State (per type)
    const [requirements, setRequirements] = useState<Record<string, DriverRequirements>>({
        taxi: { ...defaultReqs },
        remis: { ...defaultReqs },
        particular: { ...defaultReqs },
        fleet_driver: { ...defaultReqs }
    });

    // Driver Types State
    const [allowedDriverTypes, setAllowedDriverTypes] = useState({
        particular: true,
        taxi: true,
        remis: true,
        fleet_driver: true
    });

    // Operational Settings State
    const [allowNewDriverRegistrations, setAllowNewDriverRegistrations] = useState(true);
    const [requireMunicipalApproval, setRequireMunicipalApproval] = useState(true);
    const [enforceStrictDocumentExpiry, setEnforceStrictDocumentExpiry] = useState(true);

    // Commissions State
    const [vamoPercentage, setVamoPercentage] = useState<number>(6);
    const [municipalPercentage, setMunicipalPercentage] = useState<number>(0);
    const [taxiUnionPercentage, setTaxiUnionPercentage] = useState<number>(0);
    const [taxiUnionMPAccount, setTaxiUnionMPAccount] = useState<string>('');
    const [isTaxiAccountLocked, setIsTaxiAccountLocked] = useState<boolean>(false);
    
    const [remisUnionPercentage, setRemisUnionPercentage] = useState<number>(0);
    const [remisUnionMPAccount, setRemisUnionMPAccount] = useState<string>('');
    const [isRemisAccountLocked, setIsRemisAccountLocked] = useState<boolean>(false);
    
    // Gross Receipts State
    const [grossReceiptsTaxRate, setGrossReceiptsTaxRate] = useState<number>(0);

    const totalCommission = vamoPercentage + municipalPercentage + taxiUnionPercentage + remisUnionPercentage;

    useEffect(() => {
        if (!cityKey || !firestore) return;

        const loadConfig = async () => {
            try {
                const docRef = doc(firestore, 'cities', cityKey);
                const snapshot = await getDoc(docRef);
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const config = data.config || {};
                    
                    // Legacy requirements fallback
                    const legacyReqs = config.municipalRequirements || {};
                    const buildReqs = (typeSpecific: any) => {
                        const out = {} as DriverRequirements;
                        CHECKLIST_KEYS.forEach(k => {
                            out[k] = typeSpecific?.[k] ?? legacyReqs[k] ?? true;
                        });
                        return out;
                    };

                    const docReqs = config.documentRequirements || {};
                    setRequirements({
                        taxi: buildReqs(docReqs.taxi),
                        remis: buildReqs(docReqs.remis),
                        particular: buildReqs(docReqs.particular),
                        fleet_driver: buildReqs(docReqs.fleet_driver)
                    });

                    // Defaults for driver types
                    const dTypes = config.allowedDriverTypes || {};
                    setAllowedDriverTypes({
                        particular: dTypes.particular ?? true,
                        taxi: dTypes.taxi ?? true,
                        remis: dTypes.remis ?? true,
                        fleet_driver: dTypes.fleet_driver ?? true,
                    });

                    // Defaults for operational
                    setAllowNewDriverRegistrations(config.allowNewDriverRegistrations ?? true);
                    setRequireMunicipalApproval(config.requireMunicipalApproval ?? true);
                    setEnforceStrictDocumentExpiry(config.enforceStrictDocumentExpiry ?? true);

                    // Defaults for commissions
                    const comms = config.commissions || {};
                    setVamoPercentage(comms.vamoPercentage ?? 6);
                    setMunicipalPercentage(comms.municipalPercentage ?? 0);
                    
                    setTaxiUnionPercentage(comms.taxiUnionPercentage ?? 0);
                    setTaxiUnionMPAccount(comms.taxiUnionMPAccount ?? '');
                    setIsTaxiAccountLocked(!!comms.taxiUnionMPAccount);
                    
                    setRemisUnionPercentage(comms.remisUnionPercentage ?? 0);
                    setRemisUnionMPAccount(comms.remisUnionMPAccount ?? '');
                    setIsRemisAccountLocked(!!comms.remisUnionMPAccount);

                    setGrossReceiptsTaxRate(config.grossReceiptsTaxRate ?? 0);
                }
            } catch (err) {
                console.error("Error loading config:", err);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la configuración.' });
            } finally {
                setIsLoading(false);
            }
        };

        loadConfig();
    }, [cityKey, firestore]);

    const handleSave = async () => {
        if (!cityKey || !firestore) return;
        setIsSaving(true);
        try {
            const docRef = doc(firestore, 'cities', cityKey);
            await updateDoc(docRef, {
                'config.allowedDriverTypes': allowedDriverTypes,
                'config.documentRequirements': requirements,
                'config.municipalRequirements': requirements.taxi, // Legacy fallback
                'config.allowNewDriverRegistrations': allowNewDriverRegistrations,
                'config.requireMunicipalApproval': requireMunicipalApproval,
                'config.enforceStrictDocumentExpiry': enforceStrictDocumentExpiry,
                'config.commissions': {
                    vamoPercentage,
                    municipalPercentage,
                    taxiUnionPercentage,
                    taxiUnionMPAccount,
                    remisUnionPercentage,
                    remisUnionMPAccount
                },
                'config.grossReceiptsTaxRate': grossReceiptsTaxRate
            });
            toast({ title: 'Configuración Guardada', description: 'Los cambios ya están activos en la app de conductores.' });
        } catch (err) {
            console.error("Error saving config:", err);
            toast({ variant: 'destructive', title: 'Error', description: 'Fallo al guardar la configuración.' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-zinc-500">Cargando configuración...</div>;
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700">
            {/* Header */}
            <div className="mb-8">
                <span className="text-[#1D7CFF] font-black uppercase tracking-[0.3em] text-[10px]">
                    Configuración Operativa
                </span>
                <h1 className="text-4xl font-black text-foreground mt-2 uppercase italic tracking-tighter leading-none">
                    Reglas para <span className="text-[#1D7CFF]">{cityName}</span>
                </h1>
                <p className="text-muted-foreground text-xs mt-2 uppercase font-black tracking-widest">
                    Ajustá qué documentos se exigen a los conductores y otras reglas generales.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Tipos de Conductor Habilitados */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] space-y-6 md:col-span-2">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                            <VamoIcon name="users" className="w-5 h-5 text-indigo-400" />
                            Tipos de Conductor Habilitados
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            Definí qué opciones le aparecerán a los conductores al momento de registrarse en esta municipalidad.
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200 cursor-pointer">Taxi</label>
                            </div>
                            <Switch 
                                checked={allowedDriverTypes.taxi}
                                onCheckedChange={(val) => setAllowedDriverTypes(prev => ({ ...prev, taxi: val }))}
                            />
                        </div>
                        <div className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200 cursor-pointer">Remís</label>
                            </div>
                            <Switch 
                                checked={allowedDriverTypes.remis}
                                onCheckedChange={(val) => setAllowedDriverTypes(prev => ({ ...prev, remis: val }))}
                            />
                        </div>
                        <div className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200 cursor-pointer">Particular</label>
                            </div>
                            <Switch 
                                checked={allowedDriverTypes.particular}
                                onCheckedChange={(val) => setAllowedDriverTypes(prev => ({ ...prev, particular: val }))}
                            />
                        </div>
                    </div>
                </div>

                {/* Documentación Requerida */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] space-y-6 md:col-span-2">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                            <VamoIcon name="file-text" className="w-5 h-5 text-indigo-400" />
                            Documentación Obligatoria
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            Configurá qué documentos son obligatorios para cada tipo de conductor en tu municipio.
                        </p>
                    </div>
                    
                    <Tabs defaultValue="taxi" className="w-full">
                        <TabsList className="bg-zinc-900 border border-white/5 mb-6 rounded-2xl w-full flex overflow-x-auto h-auto p-1">
                            <TabsTrigger value="taxi" className="flex-1 rounded-xl font-bold py-3 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Taxi</TabsTrigger>
                            <TabsTrigger value="remis" className="flex-1 rounded-xl font-bold py-3 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Remís</TabsTrigger>
                            <TabsTrigger value="particular" className="flex-1 rounded-xl font-bold py-3 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Particular</TabsTrigger>
                            <TabsTrigger value="fleet_driver" className="flex-1 rounded-xl font-bold py-3 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Chofer</TabsTrigger>
                        </TabsList>
                        
                        {['taxi', 'remis', 'particular', 'fleet_driver'].map((type) => (
                            <TabsContent key={type} value={type} className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/30 p-6 rounded-3xl border border-white/5">
                                    {CHECKLIST_KEYS.map(key => (
                                        <div key={key} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 border border-white/5">
                                            <label className="text-sm font-semibold text-zinc-200 cursor-pointer" htmlFor={`req-${type}-${key}`}>
                                                {CHECKLIST_LABELS[key]}
                                            </label>
                                            <Switch 
                                                id={`req-${type}-${key}`}
                                                checked={requirements[type][key]}
                                                onCheckedChange={(val) => setRequirements(prev => ({ 
                                                    ...prev, 
                                                    [type]: { ...prev[type], [key]: val } 
                                                }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>

                {/* Reglas Operativas */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] space-y-6">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                            <VamoIcon name="settings" className="w-5 h-5 text-indigo-400" />
                            Reglas Generales
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            Preferencias de comportamiento del sistema.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200">Permitir nuevos registros</label>
                                <p className="text-xs text-zinc-500">Si se apaga, no podrán registrarse nuevos conductores.</p>
                            </div>
                            <Switch checked={allowNewDriverRegistrations} onCheckedChange={setAllowNewDriverRegistrations} />
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200">Requerir revisión municipal</label>
                                <p className="text-xs text-zinc-500">Si se apaga, los conductores entran activos automáticamente.</p>
                            </div>
                            <Switch checked={requireMunicipalApproval} onCheckedChange={setRequireMunicipalApproval} />
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-zinc-200">Bloqueo estricto por vencimiento</label>
                                <p className="text-xs text-zinc-500">El sistema bloquea automáticamente al vencer la licencia/seguro.</p>
                            </div>
                            <Switch checked={enforceStrictDocumentExpiry} onCheckedChange={setEnforceStrictDocumentExpiry} />
                        </div>
                    </div>
                </div>

                {/* Comisiones */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] space-y-6 md:col-span-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                                <VamoIcon name="percent" className="w-5 h-5 text-green-400" />
                                Estructura de Comisiones
                            </h2>
                            <p className="text-xs text-zinc-400 mt-1">
                                Configurá los porcentajes que pagan los conductores de tu ciudad.
                            </p>
                        </div>
                        <div className="bg-zinc-800/50 border border-zinc-700 px-4 py-2 rounded-xl text-center">
                            <div className="text-[10px] text-zinc-400 uppercase font-black tracking-widest">Total Conductor</div>
                            <div className="text-2xl font-black text-white">{totalCommission}%</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center">
                                <div className="space-y-1">
                                    <label className="text-sm font-black text-white uppercase tracking-tight">VamO (Plataforma)</label>
                                    <p className="text-xs text-zinc-500">Comisión base del sistema</p>
                                </div>
                                <Select value={vamoPercentage.toString()} onValueChange={(val) => setVamoPercentage(Number(val))}>
                                    <SelectTrigger className="w-[100px] border-zinc-700 bg-zinc-900 font-bold">
                                        <SelectValue placeholder="6%" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                        <SelectItem value="5">5%</SelectItem>
                                        <SelectItem value="6">6%</SelectItem>
                                        <SelectItem value="7">7%</SelectItem>
                                        <SelectItem value="8">8%</SelectItem>
                                        <SelectItem value="9">9%</SelectItem>
                                        <SelectItem value="10">10%</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center">
                                <div className="space-y-1">
                                    <label className="text-sm font-black text-white uppercase tracking-tight">Municipalidad</label>
                                    <p className="text-xs text-zinc-500">Canon / Recaudación local</p>
                                </div>
                                <Select value={municipalPercentage.toString()} onValueChange={(val) => setMunicipalPercentage(Number(val))}>
                                    <SelectTrigger className="w-[100px] border-zinc-700 bg-zinc-900 font-bold">
                                        <SelectValue placeholder="0%" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                        <SelectItem value="0">0%</SelectItem>
                                        <SelectItem value="1">1%</SelectItem>
                                        <SelectItem value="2">2%</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <label className="text-sm font-black text-white uppercase tracking-tight">Gremio Taxis</label>
                                        <p className="text-xs text-zinc-500">Aporte sindical</p>
                                    </div>
                                    <Select value={taxiUnionPercentage.toString()} onValueChange={(val) => setTaxiUnionPercentage(Number(val))}>
                                        <SelectTrigger className="w-[100px] border-zinc-700 bg-zinc-900 font-bold">
                                            <SelectValue placeholder="0%" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                            <SelectItem value="0">0%</SelectItem>
                                            <SelectItem value="1">1%</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {taxiUnionPercentage > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                                        <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Cuenta MercadoPago (CVU/Alias)</label>
                                        <Input 
                                            value={taxiUnionMPAccount} 
                                            onChange={(e) => setTaxiUnionMPAccount(e.target.value)} 
                                            placeholder="ej. sindicatotaxi.mp"
                                            className="bg-zinc-900 border-zinc-700 text-sm h-10 disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={isTaxiAccountLocked}
                                        />
                                        {isTaxiAccountLocked && (
                                            <p className="text-[10px] text-zinc-500">Comunicate con soporte central para modificar este alias de alta seguridad.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <label className="text-sm font-black text-white uppercase tracking-tight">Gremio Remises</label>
                                        <p className="text-xs text-zinc-500">Aporte sindical</p>
                                    </div>
                                    <Select value={remisUnionPercentage.toString()} onValueChange={(val) => setRemisUnionPercentage(Number(val))}>
                                        <SelectTrigger className="w-[100px] border-zinc-700 bg-zinc-900 font-bold">
                                            <SelectValue placeholder="0%" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                            <SelectItem value="0">0%</SelectItem>
                                            <SelectItem value="1">1%</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {remisUnionPercentage > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                                        <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Cuenta MercadoPago (CVU/Alias)</label>
                                        <Input 
                                            value={remisUnionMPAccount} 
                                            onChange={(e) => setRemisUnionMPAccount(e.target.value)} 
                                            placeholder="ej. gremioremis.mp"
                                            className="bg-zinc-900 border-zinc-700 text-sm h-10 disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={isRemisAccountLocked}
                                        />
                                        {isRemisAccountLocked && (
                                            <p className="text-[10px] text-zinc-500">Comunicate con soporte central para modificar este alias de alta seguridad.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ingresos Brutos */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] space-y-6 md:col-span-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                                <VamoIcon name="file-text" className="w-5 h-5 text-amber-400" />
                                Ingresos Brutos del Conductor
                            </h2>
                            <p className="text-xs text-zinc-400 mt-1">
                                Este porcentaje se aparta automáticamente de cada viaje para que el conductor pueda retirarlo una vez por mes y pagar ingresos brutos.
                            </p>
                        </div>
                    </div>

                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 space-y-4">
                        <div className="flex justify-between items-center max-w-sm">
                            <div className="space-y-1">
                                <label className="text-sm font-black text-white uppercase tracking-tight">Retención (%)</label>
                                <p className="text-xs text-zinc-500">Mínimo: 0% | Máximo recomendado: 2%</p>
                            </div>
                            <Select value={grossReceiptsTaxRate.toString()} onValueChange={(val) => setGrossReceiptsTaxRate(Number(val))}>
                                <SelectTrigger className="w-[100px] border-zinc-700 bg-zinc-900 font-bold text-amber-400">
                                    <SelectValue placeholder="2%" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <SelectItem value="0">0%</SelectItem>
                                    <SelectItem value="1">1%</SelectItem>
                                    <SelectItem value="2">2%</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <p className="text-xs text-blue-300 font-medium">
                                💡 Este importe no forma parte de la comisión VamO, ni de la comisión municipal, ni de asociaciones. Es un apartado contable separado del saldo disponible del conductor.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="bg-[#1D7CFF] hover:bg-[#1D7CFF]/80 text-white font-black uppercase tracking-widest rounded-2xl h-14 px-8"
                >
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </div>
        </div>
    );
}
