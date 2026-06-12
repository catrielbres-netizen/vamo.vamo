'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Benefit } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

// Helpers
const getIconForType = (type: string) => {
    switch (type) {
        case 'combustible': return 'fuel';
        case 'taller': return 'wrench';
        case 'lavadero': return 'droplets';
        case 'repuestos': return 'settings';
        default: return 'gift';
    }
};

const getColorForType = (type: string) => {
    switch (type) {
        case 'combustible': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
        case 'taller': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
        case 'lavadero': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
        case 'repuestos': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
        default: return 'bg-primary/10 text-primary border-primary/20';
    }
};

export default function MunicipalBenefitsPage() {
    const { cityKey, cityName } = useMunicipalContext();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [benefits, setBenefits] = useState<Benefit[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Form State
    const [formData, setFormData] = useState<Partial<Benefit>>({
        isActive: true,
        type: 'otros',
        minLevel: 'bronce',
        discountPercent: 10
    });

    const loadData = async () => {
        if (!firestore || !cityKey) return;
        setLoading(true);
        try {
            const benefitsQuery = query(collection(firestore, 'benefits'), where('city', '==', cityKey));
            const snap = await getDocs(benefitsQuery);
            const loaded: Benefit[] = [];
            snap.forEach(d => {
                loaded.push({ id: d.id, ...d.data() } as Benefit);
            });
            setBenefits(loaded);
        } catch (e: any) {
            console.error("Error loading benefits:", e);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudieron cargar los beneficios.'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (cityKey && firestore) {
            loadData();
        }
    }, [cityKey, firestore]);

    const handleOpenModal = (benefit?: Benefit) => {
        if (benefit) {
            setEditingId(benefit.id);
            setFormData(benefit);
        } else {
            setEditingId(null);
            setFormData({
                isActive: true,
                type: 'otros',
                minLevel: 'bronce',
                discountPercent: 10,
                city: cityKey
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!firestore || !cityKey) return;
        if (!formData.name || !formData.merchantName || !formData.discountPercent) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor completá los campos obligatorios.' });
            return;
        }

        setIsSaving(true);
        try {
            const savePayload = {
                ...formData,
                city: cityKey,
                updatedAt: new Date()
            };

            if (editingId) {
                await updateDoc(doc(firestore, 'benefits', editingId), savePayload);
                toast({ title: 'Beneficio Actualizado', description: 'Los cambios fueron guardados.' });
            } else {
                savePayload.createdAt = new Date();
                await addDoc(collection(firestore, 'benefits'), savePayload);
                toast({ title: 'Beneficio Creado', description: 'El nuevo beneficio ya está disponible.' });
            }
            setIsModalOpen(false);
            loadData();
        } catch (e: any) {
            console.error("Error saving benefit:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el beneficio.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!firestore) return;
        if (!confirm('¿Estás seguro de eliminar este beneficio definitivamente?')) return;
        try {
            await deleteDoc(doc(firestore, 'benefits', id));
            toast({ title: 'Beneficio Eliminado' });
            loadData();
        } catch (e: any) {
            console.error("Error deleting:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar.' });
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 max-w-6xl mx-auto">
                <Skeleton className="h-10 w-64 bg-white/5" />
                <Skeleton className="h-[400px] w-full bg-white/5 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Club VamO</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Gestioná los beneficios y descuentos locales en <span className="text-indigo-400 font-bold">{cityName}</span>
                    </p>
                </div>
                <Button onClick={() => handleOpenModal()} className="h-12 px-6 bg-[#1D7CFF] hover:bg-[#1D7CFF]/90 text-white font-black rounded-xl shadow-lg shadow-[#1D7CFF]/20 active:scale-[0.98]">
                    <VamoIcon name="plus" className="mr-2 h-5 w-5" /> Nuevo Beneficio
                </Button>
            </div>

            {/* List Table */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-white/5 bg-black/20">
                            <tr>
                                <th className="px-6 py-4">Beneficio</th>
                                <th className="px-6 py-4">Rubro</th>
                                <th className="px-6 py-4">Descuento</th>
                                <th className="px-6 py-4">Nivel Mínimo</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {benefits.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-zinc-500 italic">
                                        No hay beneficios cargados en esta ciudad.
                                    </td>
                                </tr>
                            ) : (
                                benefits.map(benefit => (
                                    <tr key={benefit.id} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-white text-base">{benefit.merchantName}</p>
                                            <p className="text-xs text-zinc-500 mt-0.5">{benefit.name}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={cn("uppercase tracking-wider text-[10px]", getColorForType(benefit.type))}>
                                                <VamoIcon name={getIconForType(benefit.type)} className="w-3 h-3 mr-1.5" />
                                                {benefit.type}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-black text-xl text-primary bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20">
                                                -{benefit.discountPercent}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-semibold text-zinc-300 uppercase">
                                            {benefit.minLevel}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border",
                                                benefit.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : "bg-red-500/10 text-red-400 border-red-500/20"
                                            )}>
                                                {benefit.isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    onClick={() => handleOpenModal(benefit)}
                                                    variant="ghost"
                                                    className="h-9 px-3 rounded-lg text-xs font-bold border border-white/5 hover:bg-white/5"
                                                >
                                                    Editar
                                                </Button>
                                                <Button
                                                    onClick={() => handleDelete(benefit.id)}
                                                    variant="ghost"
                                                    className="h-9 px-3 rounded-lg text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/5 border border-white/5"
                                                >
                                                    Eliminar
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Form Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-2xl bg-zinc-950 border-white/10 text-white rounded-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                            <VamoIcon name="gift" className="w-6 h-6 text-indigo-400" />
                            {editingId ? 'Editar Beneficio' : 'Nuevo Beneficio'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Nombre del Comercio *</label>
                                <Input 
                                    value={formData.merchantName || ''} 
                                    onChange={e => setFormData({...formData, merchantName: e.target.value})}
                                    placeholder="Ej. Lubricentro Pepe"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Título del Beneficio *</label>
                                <Input 
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Ej. Cambio de Aceite"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Descuento % *</label>
                                <Input 
                                    type="number"
                                    value={formData.discountPercent || ''} 
                                    onChange={e => setFormData({...formData, discountPercent: Number(e.target.value)})}
                                    placeholder="15"
                                    className="bg-zinc-900 border-zinc-800 font-bold text-lg"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Rubro</label>
                                <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v as any})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                        <SelectItem value="combustible">Combustible</SelectItem>
                                        <SelectItem value="taller">Taller Mecánico</SelectItem>
                                        <SelectItem value="lavadero">Lavadero</SelectItem>
                                        <SelectItem value="repuestos">Repuestos</SelectItem>
                                        <SelectItem value="gastronomia">Gastronomía</SelectItem>
                                        <SelectItem value="otros">Otros</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Nivel Mínimo</label>
                                <Select value={formData.minLevel} onValueChange={v => setFormData({...formData, minLevel: v as any})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                        <SelectItem value="bronce">Bronce (Todos)</SelectItem>
                                        <SelectItem value="plata">Plata</SelectItem>
                                        <SelectItem value="oro">Oro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Descripción Corta</label>
                            <Textarea 
                                value={formData.description || ''} 
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                placeholder="Breve descripción del beneficio..."
                                className="bg-zinc-900 border-zinc-800 min-h-[80px]"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Dirección</label>
                                <Input 
                                    value={formData.address || ''} 
                                    onChange={e => setFormData({...formData, address: e.target.value})}
                                    placeholder="Ej. Av. San Martín 123"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tope / Límite</label>
                                <Input 
                                    value={formData.limitDescription || ''} 
                                    onChange={e => setFormData({...formData, limitDescription: e.target.value})}
                                    placeholder="Ej. Hasta $5.000 por mes"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Condiciones</label>
                                <Input 
                                    value={formData.conditions || ''} 
                                    onChange={e => setFormData({...formData, conditions: e.target.value})}
                                    placeholder="Ej. Solo pago en efectivo"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cómo se aplica</label>
                                <Input 
                                    value={formData.applicationMethod || ''} 
                                    onChange={e => setFormData({...formData, applicationMethod: e.target.value})}
                                    placeholder="Ej. Presentando QR en caja"
                                    className="bg-zinc-900 border-zinc-800"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                            <div>
                                <h4 className="font-bold text-white">Estado del Beneficio</h4>
                                <p className="text-xs text-zinc-500">Si lo apagás, desaparece de la app de conductores.</p>
                            </div>
                            <Switch 
                                checked={formData.isActive} 
                                onCheckedChange={v => setFormData({...formData, isActive: v})} 
                            />
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className="bg-[#1D7CFF] hover:bg-[#1D7CFF]/90 text-white font-black px-8 rounded-xl h-12 w-full md:w-auto"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar Beneficio'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
