'use client';

import React, { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Benefit } from '@/lib/types';
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
import { Loader2 } from 'lucide-react';

const BENEFIT_TYPES = ['combustible', 'taller', 'lavadero', 'repuestos', 'gastronomia', 'otro'];

export default function AdminBenefitsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const benefitsQuery = useMemo(() => firestore ? query(
        collection(firestore, 'benefits'),
        orderBy('name', 'asc')
    ) : null, [firestore]);
    
    const { data: benefits, isLoading } = useCollection<Benefit>(benefitsQuery);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBenefit, setEditingBenefit] = useState<Benefit | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Partial<Benefit>>({
        name: '', merchantName: '', type: 'otro', discountPercent: 0, 
        address: '', city: 'Rawson', conditions: '', limitDescription: '', 
        applicationMethod: '', logoUrl: '', isActive: true
    });

    const handleOpenCreate = () => {
        setFormData({
            name: '', merchantName: '', type: 'otro', discountPercent: 0, 
            address: '', city: 'Rawson', conditions: '', limitDescription: '', 
            applicationMethod: '', logoUrl: '', isActive: true
        });
        setEditingBenefit(null);
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (benefit: Benefit) => {
        setFormData({ ...benefit });
        setEditingBenefit(benefit);
        setIsDialogOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.merchantName || !formData.address || !formData.discountPercent || !formData.conditions) {
            toast({ variant: "destructive", title: "Error", description: "Completá todos los campos obligatorios (*)." });
            return;
        }

        if (!firestore) return;
        setIsSubmitting(true);

        try {
            const payload = {
                ...formData,
                discountPercent: Number(formData.discountPercent),
                updatedAt: new Date()
            };

            if (editingBenefit?.id) {
                await updateDoc(doc(firestore, 'benefits', editingBenefit.id), payload);
                toast({ title: "Beneficio Actualizado", description: "Los cambios se guardaron con éxito." });
            } else {
                await addDoc(collection(firestore, 'benefits'), {
                    ...payload,
                    createdAt: new Date()
                });
                toast({ title: "Beneficio Creado", description: "El beneficio ya está disponible para los conductores." });
            }
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error al guardar", description: "Verificá la conexión y volvé a intentar." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (benefit: Benefit) => {
        if (!firestore || !benefit.id) return;
        try {
            await updateDoc(doc(firestore, 'benefits', benefit.id), {
                isActive: !benefit.isActive
            });
            toast({ title: benefit.isActive ? "Beneficio Pausado" : "Beneficio Activado" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error" });
        }
    };

    const loadDemoData = async () => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            const demoBenefits = [
                {
                    id: 'demo-benefit-1',
                    name: 'Carga de Nafta Super / Infinia',
                    merchantName: 'YPF Norte',
                    type: 'combustible',
                    discountPercent: 10,
                    address: 'Av. Hipólito Yrigoyen 1500',
                    city: 'Rawson',
                    conditions: 'Exclusivo para choferes activos con vehículo registrado en plataforma.',
                    limitDescription: 'Tope de reintegro $5000 por semana.',
                    applicationMethod: 'Muestra tu código de autorización QR al playero antes de pagar.',
                    isActive: true,
                    createdAt: new Date()
                },
                {
                    id: 'demo-benefit-2',
                    name: 'Cambio de Aceite y Filtro (Pack Premium)',
                    merchantName: 'Lubricentro El Tuerca',
                    type: 'taller',
                    discountPercent: 20,
                    address: 'San Martín 432',
                    city: 'Rawson',
                    conditions: 'Lunes a Jueves de 08:00 a 17:00hs. Solo mano de obra y filtros nacionales.',
                    limitDescription: 'Sin tope. Un uso al mes por conductor.',
                    applicationMethod: 'El comercio escaneará el código VAMO en caja.',
                    isActive: true,
                    createdAt: new Date()
                },
                {
                    id: 'demo-benefit-3',
                    name: 'Lavado Completo (Auto/Camioneta)',
                    merchantName: 'Lavadero Espumita',
                    type: 'lavadero',
                    discountPercent: 30,
                    address: 'Av. Rawson 88',
                    city: 'Rawson',
                    conditions: 'Válido todos los días. No incluye lavado de motor ni chasis inferior.',
                    limitDescription: 'Sin límite de reintegro.',
                    applicationMethod: 'Menciona tu ID VamO al dejar el vehículo.',
                    isActive: true,
                    createdAt: new Date()
                }
            ];

            for (const b of demoBenefits) {
                const { id, ...data } = b;
                await setDoc(doc(firestore, 'benefits', id), data);
            }
            toast({ title: "Datos Demo Cargados", description: "Se crearon o actualizaron 3 beneficios reales para prueba." });
        } catch(e) {
            console.error("Error exacto cargando demo data:", e);
            toast({ variant: "destructive", title: "Error cargando demo" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black italic tracking-tighter">Beneficios <span className="text-primary not-italic tracking-normal">Club VamO</span></h1>
                    <p className="text-muted-foreground">Gestión de alianzas y descuentos para conductores.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 rounded-xl border-zinc-800 bg-zinc-900/50" onClick={loadDemoData} disabled={isSubmitting}>
                        <VamoIcon name="database" className="mr-2 h-4 w-4" /> Cargar Demo
                    </Button>
                    <Button className="h-10 rounded-xl px-6 bg-primary font-bold text-white shadow-lg shadow-primary/20" onClick={handleOpenCreate}>
                        <VamoIcon name="plus" className="mr-2 h-4 w-4" /> Nuevo Beneficio
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    [1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)
                ) : benefits?.map(benefit => (
                    <div key={benefit.id} className="relative group bg-black/40 border border-zinc-800 rounded-2xl p-6 backdrop-blur-xl shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <Badge className={cn(
                                    "text-[9px] uppercase font-black tracking-widest",
                                    benefit.isActive ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-800 text-zinc-500"
                                )}>
                                    {benefit.isActive ? 'Activo' : 'Inactivo'}
                                </Badge>
                                <div className="text-2xl font-black text-primary">-{benefit.discountPercent}%</div>
                            </div>
                            <h3 className="font-black text-white text-xl leading-tight mb-1">{benefit.merchantName}</h3>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">{benefit.name}</p>
                            
                            <div className="space-y-3 text-xs text-zinc-400 bg-zinc-900/50 p-4 rounded-xl mb-6 border border-zinc-800/50">
                                <p className="flex items-start gap-2 leading-relaxed"><VamoIcon name="map-pin" className="h-3 w-3 mt-0.5 text-zinc-600 shrink-0" /> {benefit.address}, {benefit.city}</p>
                                <p className="flex items-start gap-2 leading-relaxed"><VamoIcon name="user" className="h-3 w-3 mt-0.5 text-zinc-600 shrink-0" /> {benefit.conditions}</p>
                                {benefit.limitDescription && <p className="flex items-start gap-2 leading-relaxed italic"><VamoIcon name="alert-circle" className="h-3 w-3 mt-0.5 text-zinc-600 shrink-0" /> {benefit.limitDescription}</p>}
                            </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1 text-xs h-10 font-bold border-zinc-800 bg-white/5 hover:bg-white/10 rounded-xl" onClick={() => handleOpenEdit(benefit)}>
                                EDITAR
                            </Button>
                            <Button 
                                variant={benefit.isActive ? "ghost" : "default"} 
                                className={cn(
                                    "flex-1 text-xs h-10 font-black rounded-xl uppercase tracking-widest",
                                    benefit.isActive ? "text-red-500 hover:bg-red-500/10" : "bg-green-600 hover:bg-green-700 text-white"
                                )}
                                onClick={() => handleToggleStatus(benefit)}
                            >
                                {benefit.isActive ? 'PAUSAR' : 'ACTIVAR'}
                            </Button>
                        </div>
                    </div>
                ))}

                {benefits?.length === 0 && !isLoading && (
                    <div className="col-span-full border-2 border-dashed border-zinc-800 rounded-3xl p-16 text-center text-zinc-600 flex flex-col items-center">
                        <VamoIcon name="target" className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-xl font-black text-zinc-400">Sin beneficios vigentes</h3>
                        <p className="max-w-md mx-auto mt-2 text-sm">Empieza cargando los datos demo o crea un enlace estratégico.</p>
                        <Button className="mt-8 rounded-xl bg-zinc-800 text-white" onClick={loadDemoData}>Cargar Demo</Button>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-lg rounded-3xl bg-zinc-950 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">{editingBenefit ? 'Editar Beneficio' : 'Nuevo Beneficio'}</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium">
                            Completa los detalles de la alianza estratégica.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Comercio *</Label>
                                <Input className="bg-zinc-900 border-zinc-800" placeholder="Ej: YPF Norte" value={formData.merchantName} onChange={e => setFormData({...formData, merchantName: e.target.value})} required />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Título Descuento *</Label>
                                <Input className="bg-zinc-900 border-zinc-800" placeholder="Ej: Carga de Nafta Super" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Rubro *</Label>
                                <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                        <SelectValue placeholder="Seleccionar" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        {BENEFIT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">% Descuento *</Label>
                                <Input className="bg-zinc-900 border-zinc-800" type="number" min="1" max="100" placeholder="15" value={formData.discountPercent || ''} onChange={e => setFormData({...formData, discountPercent: Number(e.target.value)})} required />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Dirección *</Label>
                                <Input className="bg-zinc-900 border-zinc-800" placeholder="San Martín 123" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} required />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Ciudad *</Label>
                                <Input className="bg-zinc-900 border-zinc-800" placeholder="Trelew" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Condiciones *</Label>
                            <Textarea className="bg-zinc-900 border-zinc-800 min-h-[100px]" placeholder="Condiciones de uso..." value={formData.conditions} onChange={e => setFormData({...formData, conditions: e.target.value})} required />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Límite / Tope</Label>
                            <Input className="bg-zinc-900 border-zinc-800" placeholder="Ej: Tope reintegro $5000" value={formData.limitDescription} onChange={e => setFormData({...formData, limitDescription: e.target.value})} />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Método de Aplicación</Label>
                            <Input className="bg-zinc-900 border-zinc-800" placeholder="Ej: Mostrar QR en caja" value={formData.applicationMethod} onChange={e => setFormData({...formData, applicationMethod: e.target.value})} />
                        </div>

                        <DialogFooter className="pt-6">
                            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="font-black px-8 bg-white text-black transition-all hover:bg-zinc-200 rounded-xl">
                                {isSubmitting ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <VamoIcon name="save" className="w-4 h-4 mr-2" />}
                                {editingBenefit ? 'GUARDAR MÓDULO' : 'ACTIVAR BENEFICIO'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
