'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirebase } from '@/firebase/provider';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    limit 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Role } from '@/lib/types';

export default function TeamPage() {
    const { profile } = useUser();
    const { firestore, functions } = useFirebase();
    const { cityKey: currentCityKey, isMuniAdmin } = useMunicipalContext();
    const { toast } = useToast();
    
    const [team, setTeam] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'operator_municipal' as Role });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const cityKey = currentCityKey || profile?.cityKey;
    const canManageTeam = isMuniAdmin;

    useEffect(() => {
        if (!firestore || !cityKey) return;

        // 1. Listen to Team Members
        const qTeam = query(
            collection(firestore, 'users'),
            where('cityKey', '==', cityKey),
            where('role', 'in', ['admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal'])
        );
        const unsubTeam = onSnapshot(qTeam, (snap) => {
            setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        // 2. Listen to Audit Logs
        const qLogs = query(
            collection(firestore, 'municipal_audit_log'),
            where('cityKey', '==', cityKey),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.error("Audit Log error:", err);
        });

        return () => {
            unsubTeam();
            unsubLogs();
        };
    }, [firestore, cityKey]);

    const handleCreateUser = async () => {
        if (!newUser.email || !newUser.password || !newUser.name) {
            toast({ variant: 'destructive', title: 'Campos incompletos', description: 'Por favor completá todos los datos.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const createMember = httpsCallable(functions!, 'createMunicipalUserV1');
            await createMember({
                ...newUser,
                cityKey
            });
            
            toast({ title: 'Usuario creado', description: `El usuario ${newUser.name} ha sido habilitado.` });
            setIsAddModalOpen(false);
            setNewUser({ email: '', password: '', name: '', role: 'operator_municipal' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (uid: string, currentStatus: string) => {
        const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
        try {
            const updateMember = httpsCallable(functions!, 'updateMunicipalUserV1');
            await updateMember({ targetUid: uid, status: newStatus });
            toast({ title: 'Estado actualizado', description: 'El acceso ha sido modificado.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const getRoleBadge = (role: string) => {
        const roles: any = {
            admin_municipal: { label: 'Administrador', class: 'bg-indigo-500/10 text-indigo-400' },
            operator_municipal: { label: 'Operador', class: 'bg-emerald-500/10 text-emerald-400' },
            treasury_municipal: { label: 'Tesorería', class: 'bg-amber-500/10 text-amber-400' },
            auditor_municipal: { label: 'Auditor', class: 'bg-zinc-500/10 text-zinc-400' },
        };
        const config = roles[role] || { label: role, class: 'bg-zinc-800 text-zinc-500' };
        return <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter", config.class)}>{config.label}</span>;
    };

    if (loading) {
        return <div className="flex h-[60vh] items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Equipo Municipal</h1>
                    <p className="text-zinc-500 text-sm italic">Gestión de usuarios internos y auditoría de acciones.</p>
                </div>
                {canManageTeam && (
                    <Button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
                    >
                        <VamoIcon name="plus" className="w-4 h-4 mr-2" />
                        Agregar Usuario
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* USER LIST */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <VamoIcon name="users" className="w-5 h-5 text-zinc-500" />
                        <h2 className="text-lg font-black text-white tracking-tight uppercase">Usuarios Activos</h2>
                    </div>
                    <div className="bg-zinc-900/40 border border-white/5 rounded-[2rem] overflow-hidden">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Nombre</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Rol</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-zinc-500">Email</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-zinc-500">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {team.map((member) => (
                                    <TableRow key={member.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <TableCell className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400">
                                                {member.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-bold text-white">{member.name}</span>
                                        </TableCell>
                                        <TableCell>{getRoleBadge(member.role)}</TableCell>
                                        <TableCell className="text-xs text-zinc-500 font-mono">{member.email}</TableCell>
                                        <TableCell className="text-right">
                                            {canManageTeam && member.uid !== profile?.uid && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleToggleStatus(member.uid, member.status)}
                                                    className={cn("h-7 px-2 text-[9px] font-black uppercase rounded-lg", member.status === 'inactive' ? "text-emerald-500" : "text-amber-500")}
                                                >
                                                    {member.status === 'inactive' ? 'Activar' : 'Suspender'}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* AUDIT LOGS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <VamoIcon name="list" className="w-5 h-5 text-zinc-500" />
                        <h2 className="text-lg font-black text-white tracking-tight uppercase">Auditoría Reciente</h2>
                    </div>
                    <div className="space-y-3">
                        {auditLogs.length === 0 ? (
                            <div className="p-8 text-center bg-zinc-900/40 border border-white/5 rounded-[2rem] text-zinc-600 italic">
                                No hay registros de auditoría.
                            </div>
                        ) : auditLogs.map((log) => (
                            <div key={log.id} className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-2">
                                <div className="flex justify-between items-start">
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">{log.action.replace('_', ' ')}</span>
                                    <span className="text-[9px] text-zinc-600">{log.createdAt?.toDate().toLocaleTimeString()}</span>
                                </div>
                                <p className="text-[11px] text-white">
                                    <span className="font-bold">{log.actorName}</span> realizó una acción sobre <span className="text-zinc-400">{log.targetType}</span>
                                </p>
                                {log.metadata && (
                                    <div className="bg-black/20 p-2 rounded text-[9px] font-mono text-zinc-500 truncate">
                                        {JSON.stringify(log.metadata)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ADD USER MODAL */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="bg-zinc-900 border-white/10 sm:rounded-[2rem] max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-white tracking-tighter uppercase">NUEVO USUARIO MUNICIPAL</DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Creá una cuenta para un nuevo integrante del equipo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Nombre Completo</Label>
                            <Input 
                                placeholder="Ej: Juan Pérez"
                                value={newUser.name}
                                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-sm text-white transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Email Institucional</Label>
                            <Input 
                                type="email"
                                placeholder="usuario@municipio.gov.ar"
                                value={newUser.email}
                                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-sm text-white transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Contraseña Temporal</Label>
                            <Input 
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                value={newUser.password}
                                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-sm text-white transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Rol en el Sistema</Label>
                            <select 
                                value={newUser.role}
                                onChange={(e) => setNewUser({...newUser, role: e.target.value as Role})}
                                className="w-full h-12 px-4 rounded-2xl bg-white/[0.03] border-white/5 text-sm text-white focus:outline-none transition-all"
                            >
                                <option value="operator_municipal" className="bg-zinc-900">Operador (Verificaciones)</option>
                                <option value="treasury_municipal" className="bg-zinc-900">Tesorería (Pagos y Retiros)</option>
                                <option value="auditor_municipal" className="bg-zinc-900">Auditor (Solo Lectura)</option>
                                <option value="admin_municipal" className="bg-zinc-900">Administrador (Control Total)</option>
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button 
                            onClick={handleCreateUser}
                            disabled={isSubmitting}
                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
                        >
                            {isSubmitting ? 'Creando Usuario...' : 'Habilitar Cuenta'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
