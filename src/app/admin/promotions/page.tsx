'use client';

import React, { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, addDoc, updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Promotion, PromotionStatus, PromotionTarget, PromotionContext } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from '@/lib/utils';
import { Loader2, TrendingUp, Users, Ticket, Activity } from 'lucide-react';

const STATUS_OPTIONS: PromotionStatus[] = ['draft', 'active', 'paused', 'expired'];
const TARGET_OPTIONS: PromotionTarget[] = ['driver', 'passenger'];
const CONTEXT_OPTIONS: PromotionContext[] = ['topup', 'ride', 'signup', 'reactivation', 'general'];

export default function AdminPromotionsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const promotionsQuery = useMemo(() => firestore ? query(
        collection(firestore, 'promotions'),
        orderBy('createdAt', 'desc')
    ) : null, [firestore]);
    
    const { data: promotions, isLoading } = useCollection<Promotion>(promotionsQuery);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Partial<Promotion>>({
        name: '', description: '', target: 'passenger', status: 'draft', 
        enabled: true, priority: 10, stackable: false, context: 'ride',
        city: 'global',
        conditions: { minAmount: 0, isFirstAction: false },
        reward: { type: 'fixed', value: 0 },
        limits: { maxRedemptionsPerUser: 1 }
    });

    const handleOpenCreate = () => {
        setFormData({
            name: '', description: '', target: 'passenger', status: 'active', 
            enabled: true, priority: 10, stackable: false, context: 'ride',
            city: 'global',
            conditions: { minAmount: 0, isFirstAction: false },
            reward: { type: 'fixed', value: 0 },
            limits: { maxRedemptionsPerUser: 1 }
        });
        setEditingPromo(null);
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (promo: Promotion) => {
        setFormData({ ...promo });
        setEditingPromo(promo);
        setIsDialogOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.reward?.value) {
            toast({ variant: "destructive", title: "Error", description: "Completá los campos obligatorios." });
            return;
        }

        if (!firestore) return;
        setIsSubmitting(true);

        try {
            const payload = {
                ...formData,
                updatedAt: serverTimestamp()
            };

            if (editingPromo?.id) {
                await updateDoc(doc(firestore, 'promotions', editingPromo.id), payload as any);
                toast({ title: "Promo Actualizada", description: "Los cambios se guardaron con éxito." });
            } else {
                await addDoc(collection(firestore, 'promotions'), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
                toast({ title: "Promo Creada", description: "La promoción ya está configurada." });
            }
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error al guardar", description: "Verificá la conexión y volvé a intentar." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (promo: Promotion) => {
        if (!firestore || !promo.id) return;
        const newStatus: PromotionStatus = promo.status === 'active' ? 'paused' : 'active';
        try {
            await updateDoc(doc(firestore, 'promotions', promo.id), {
                status: newStatus,
                enabled: newStatus === 'active',
                updatedAt: serverTimestamp()
            });
            toast({ title: newStatus === 'active' ? "Promoción Activada" : "Promoción Pausada" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error" });
        }
    };

    const loadDemoData = async () => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            const demoPromos: Partial<Promotion>[] = [
                {
                    name: 'Bono Recarga Silver',
                    description: 'Carga $10,000 y recibí $2,000 de regalo para comisiones.',
                    target: 'driver',
                    status: 'active',
                    enabled: true,
                    priority: 20,
                    stackable: true,
                    context: 'topup',
                    city: 'global',
                    conditions: { minAmount: 10000 },
                    reward: { type: 'fixed', value: 2000 },
                    limits: { maxRedemptionsPerUser: 10 }
                },
                {
                    name: 'Bono Recarga Gold',
                    description: 'Carga $20,000 y recibí $5,000 de regalo para comisiones.',
                    target: 'driver',
                    status: 'active',
                    enabled: true,
                    priority: 30,
                    stackable: true,
                    context: 'topup',
                    city: 'global',
                    conditions: { minAmount: 20000 },
                    reward: { type: 'fixed', value: 5000 },
                    limits: { maxRedemptionsPerUser: 10 }
                },
                {
                    name: 'Primer Viaje VamO',
                    description: 'Tu primer viaje tiene un 20% de descuento automático.',
                    target: 'passenger',
                    status: 'active',
                    enabled: true,
                    priority: 100,
                    stackable: false,
                    context: 'ride',
                    city: 'global',
                    conditions: { isFirstAction: true },
                    reward: { type: 'percentage', value: 20, cap: 1500 },
                    limits: { maxRedemptionsPerUser: 1 }
                },
                {
                    name: 'Te extrañamos',
                    description: 'Volvé a viajar con nosotros y obtené 15% de descuento.',
                    target: 'passenger',
                    status: 'active',
                    enabled: true,
                    priority: 50,
                    stackable: false,
                    context: 'ride',
                    city: 'global',
                    conditions: { daysInactive: 15 },
                    reward: { type: 'percentage', value: 15, cap: 1000 },
                    limits: { maxRedemptionsPerUser: 1 }
                }
            ];

            for (const p of demoPromos) {
                await addDoc(collection(firestore, 'promotions'), {
                    ...p,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            toast({ title: "Datos Demo Cargados", description: "Se crearon 4 promociones base para V1." });
        } catch(e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error cargando demo" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const stats = useMemo(() => {
        if (!promotions) return { total: 0, active: 0, driver: 0, passenger: 0 };
        return {
            total: promotions.length,
            active: promotions.filter(p => p.status === 'active').length,
            driver: promotions.filter(p => p.target === 'driver').length,
            passenger: promotions.filter(p => p.target === 'passenger').length,
        };
    }, [promotions]);

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black italic tracking-tighter">Motor de <span className="text-primary not-italic tracking-normal">Promociones</span></h1>
                    <p className="text-muted-foreground">Gestión centralizada de incentivos, bonos y descuentos.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 rounded-xl border-zinc-800 bg-zinc-900/50" onClick={loadDemoData} disabled={isSubmitting}>
                        <VamoIcon name="database" className="mr-2 h-4 w-4" /> V1 Seeding
                    </Button>
                    <Button className="h-10 rounded-xl px-6 bg-primary font-bold text-white shadow-lg shadow-primary/20" onClick={handleOpenCreate}>
                        <VamoIcon name="plus" className="mr-2 h-4 w-4" /> Nueva Promoción
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total', value: stats.total, icon: Ticket, color: 'text-zinc-400' },
                    { label: 'Activas', value: stats.active, icon: Activity, color: 'text-green-500' },
                    { label: 'Conductores', value: stats.driver, icon: Users, color: 'text-indigo-400' },
                    { label: 'Pasajeros', value: stats.passenger, icon: TrendingUp, color: 'text-primary' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
                        <div className={cn("p-2 rounded-xl bg-zinc-800", kpi.color)}>
                            <kpi.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{kpi.label}</p>
                            <p className="text-2xl font-black text-white">{kpi.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    [1,2,3].map(i => <Skeleton key={i} className="h-72 rounded-2xl" />)
                ) : promotions?.map(promo => (
                    <div key={promo.id} className="relative group bg-black/40 border border-zinc-800 rounded-3xl p-6 backdrop-blur-xl shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between overflow-hidden">
                        {/* Status Bar */}
                        <div className={cn(
                            "absolute top-0 right-0 px-4 py-1 text-[8px] font-black uppercase tracking-tighter rounded-bl-xl",
                            promo.status === 'active' ? "bg-green-500 text-black" : 
                            promo.status === 'paused' ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"
                        )}>
                            {promo.status}
                        </div>

                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <Badge className={cn(
                                    "text-[9px] uppercase font-black tracking-widest",
                                    promo.target === 'driver' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-primary/10 text-primary border-primary/20 shadow-none"
                                )}>
                                    {promo.target}
                                </Badge>
                                <div className="text-2xl font-black text-white">
                                    {promo.reward.type === 'fixed' ? `$${promo.reward.value}` : `${promo.reward.value}%`}
                                </div>
                            </div>
                            
                            <h3 className="font-black text-white text-xl leading-tight mb-2">{promo.name}</h3>
                            <p className="text-zinc-500 text-xs leading-relaxed mb-6 line-clamp-2">{promo.description}</p>
                            
                            <div className="grid grid-cols-2 gap-2 mb-6">
                                <div className="bg-zinc-900/50 p-2 rounded-xl border border-zinc-800/50">
                                    <p className="text-[8px] font-black uppercase text-zinc-600 mb-0.5">Contexto</p>
                                    <p className="text-[10px] font-bold text-white capitalize">{promo.context}</p>
                                </div>
                                <div className="bg-zinc-900/50 p-2 rounded-xl border border-zinc-800/50">
                                    <p className="text-[8px] font-black uppercase text-zinc-600 mb-0.5">Stackable</p>
                                    <p className={cn("text-[10px] font-bold", promo.stackable ? "text-green-500" : "text-zinc-500")}>
                                        {promo.stackable ? 'SÍ' : 'NO'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 text-[10px] text-zinc-400 bg-zinc-900/30 p-3 rounded-2xl border border-white/[0.02]">
                                <p className="flex items-center gap-2 font-medium">
                                    <VamoIcon name="map-pin" className="h-3 w-3 text-zinc-600" />
                                    Alcance: <span className="font-bold text-zinc-300">{promo.city || 'Global'}</span>
                                </p>
                                <p className="flex items-center gap-2 font-medium">
                                    <VamoIcon name="lock" className="h-3 w-3 text-zinc-600" />
                                    Prioridad: <span className="font-bold text-zinc-300">{promo.priority}</span>
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 pt-6">
                            <Button variant="outline" className="flex-1 text-[10px] h-10 font-bold border-zinc-800 bg-white/5 hover:bg-white/10 rounded-xl" onClick={() => handleOpenEdit(promo)}>
                                EDITAR
                            </Button>
                            <Button 
                                variant="ghost"
                                className={cn(
                                    "flex-1 text-[10px] h-10 font-black rounded-xl uppercase tracking-widest",
                                    promo.status === 'active' ? "text-amber-500 hover:bg-amber-500/10" : "bg-green-600 hover:bg-green-700 text-white"
                                )}
                                onClick={() => handleToggleStatus(promo)}
                            >
                                {promo.status === 'active' ? 'PAUSAR' : 'ACTIVAR'}
                            </Button>
                        </div>
                    </div>
                ))}

                {promotions?.length === 0 && !isLoading && (
                    <div className="col-span-full border-2 border-dashed border-zinc-800 rounded-3xl p-16 text-center text-zinc-600 flex flex-col items-center">
                        <Ticket className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-xl font-black text-zinc-400">Sin promociones configuradas</h3>
                        <p className="max-w-md mx-auto mt-2 text-sm">Empieza cargando los datos de la V1 o crea una regla personalizada.</p>
                        <Button className="mt-8 rounded-xl bg-zinc-800 text-white" onClick={loadDemoData}>Cargar V1 Promos</Button>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-xl rounded-[2.5rem] bg-zinc-950 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">{editingPromo ? 'Editar Promoción' : 'Nueva Promoción'}</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium">
                            Configura las reglas, condiciones y recompensas del motor.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                        <div className="space-y-4 bg-zinc-900/40 p-6 rounded-3xl border border-white/[0.02]">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Nombre Público *</Label>
                                    <Input className="bg-zinc-900 border-zinc-800 h-12 rounded-xl" placeholder="Ej: Bono Bienvenida" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Público Objetivo</Label>
                                    <Select value={formData.target} onValueChange={v => setFormData({...formData, target: v as any})}>
                                        <SelectTrigger className="bg-zinc-900 border-zinc-800 h-12 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            {TARGET_OPTIONS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Descripción / Teaser</Label>
                                <Textarea className="bg-zinc-900 border-zinc-800 min-h-[80px] rounded-xl" placeholder="Explicación del beneficio para el usuario..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Prioridad</Label>
                                <Input className="bg-zinc-900 border-zinc-800 h-12 rounded-xl" type="number" value={formData.priority} onChange={e => setFormData({...formData, priority: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Contexto</Label>
                                <Select value={formData.context} onValueChange={v => setFormData({...formData, context: v as any})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800 h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        {CONTEXT_OPTIONS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Stackable</Label>
                                <Select value={formData.stackable ? 'yes' : 'no'} onValueChange={v => setFormData({...formData, stackable: v === 'yes'})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800 h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        <SelectItem value="yes">SÍ</SelectItem>
                                        <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Estado</Label>
                                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v as any})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800 h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        {STATUS_OPTIONS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Conditions and Rewards Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4 p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                                    <VamoIcon name="alert-circle" className="w-4 h-4" /> Condiciones
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold text-zinc-400">Monto Mínimo</Label>
                                        <Input className="bg-zinc-900 border-zinc-800 h-8 w-24 text-right rounded-lg" type="number" value={formData.conditions?.minAmount || 0} onChange={e => setFormData({...formData, conditions: {...formData.conditions, minAmount: Number(e.target.value)}})} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold text-zinc-400">Sólo Primera Acción</Label>
                                        <Button 
                                            type="button" 
                                            variant={formData.conditions?.isFirstAction ? 'default' : 'outline'}
                                            className="h-8 text-[9px] font-black rounded-lg"
                                            onClick={() => setFormData({...formData, conditions: {...formData.conditions, isFirstAction: !formData.conditions?.isFirstAction}})}
                                        >
                                            {formData.conditions?.isFirstAction ? 'ACTIVADO' : 'DESACTIVADO'}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 p-6 bg-primary/5 rounded-3xl border border-primary/10">
                                <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4" /> Recompensa
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <Select value={formData.reward?.type} onValueChange={v => setFormData({...formData, reward: {...formData.reward!, type: v as any}})}>
                                            <SelectTrigger className="bg-zinc-900 border-zinc-800 h-8 w-32 rounded-lg text-[10px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                                <SelectItem value="fixed">Fijo ($)</SelectItem>
                                                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input className="bg-zinc-900 border-zinc-800 h-8 w-24 text-right rounded-lg" type="number" value={formData.reward?.value || 0} onChange={e => setFormData({...formData, reward: {...formData.reward!, value: Number(e.target.value)}})} />
                                    </div>
                                    {formData.reward?.type === 'percentage' && (
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] font-bold text-zinc-400">Tope Máximo</Label>
                                            <Input className="bg-zinc-900 border-zinc-800 h-8 w-24 text-right rounded-lg" type="number" placeholder="Ej: 1000" value={formData.reward?.cap || ''} onChange={e => setFormData({...formData, reward: {...formData.reward!, cap: Number(e.target.value)}})} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-6">
                            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="font-black px-8 bg-white text-black transition-all hover:bg-zinc-200 rounded-xl h-12">
                                {isSubmitting ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <VamoIcon name="save" className="w-4 h-4 mr-2" />}
                                {editingPromo ? 'GUARDAR CAMBIOS' : 'CREAR PROMOCIÓN'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
