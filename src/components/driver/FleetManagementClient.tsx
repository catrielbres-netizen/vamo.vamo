'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore, useFunctions } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { UserProfile } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VamoIcon } from '@/components/VamoIcon';

export default function FleetManagementClient() {
  const { user } = useUser();
  const db = useFirestore();
  const functions = useFunctions();
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment Agreement State
  const [editingDriver, setEditingDriver] = useState<UserProfile | null>(null);
  const [driverShare, setDriverShare] = useState<string>('30');
  const [isSavingAgreement, setIsSavingAgreement] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    dni: '',
    phone: '',
    email: '',
    password: '',
    vehicleId: '',
    approved: true
  });

  useEffect(() => {
    if (user) {
      loadDrivers();
    }
  }, [user]);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const listFleetDrivers = httpsCallable(functions, 'listFleetDriversV1');
      const result = await listFleetDrivers();
      setDrivers((result.data as any).drivers || []);
    } catch (e: any) {
      console.error(e);
      if (e.code === 'permission-denied') {
        setError('No tenés permisos para ver los choferes. Falta configurar las reglas de seguridad o tu perfil no es de dueño.');
      } else if (e.code === 'failed-precondition') {
        setError('Falta un índice en la base de datos para cargar los choferes. Revisa la consola para el link de creación.');
      } else {
        setError(`Error al cargar choferes: ${e.message || 'Desconocido'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (driverId: string, action: 'approve' | 'suspend' | 'unlink') => {
    setError(null);
    setSuccessMsg(null);
    try {
      const manageFleetDriver = httpsCallable(functions, 'manageFleetDriverV1');
      await manageFleetDriver({ driverId, action });
      
      if (action === 'approve') setSuccessMsg('Chofer aprobado correctamente');
      if (action === 'suspend') setSuccessMsg('Chofer suspendido');
      if (action === 'unlink') setSuccessMsg('Chofer desvinculado');

      loadDrivers();
    } catch (e: any) {
      console.error(e);
      setError('Error: no tenés permiso para modificar este chofer o hubo un error interno.');
    }
  };

  const handleSaveAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setError(null);
    setSuccessMsg(null);
    setIsSavingAgreement(true);

    try {
      const share = parseInt(driverShare, 10);
      if (isNaN(share) || share < 0 || share > 100) {
        throw new Error("El porcentaje debe ser un número entre 0 y 100");
      }

      const updateAgreement = httpsCallable(functions, 'updateFleetDriverPaymentAgreementV1');
      await updateAgreement({
        driverId: editingDriver.id,
        driverSharePercent: share,
        ownerSharePercent: 100 - share
      });

      setSuccessMsg('Acuerdo de pago actualizado correctamente.');
      setEditingDriver(null);
      loadDrivers();
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error al guardar el acuerdo.');
    } finally {
      setIsSavingAgreement(false);
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!formData.name || !formData.dni || !formData.phone || !formData.email || !formData.password || !formData.vehicleId) {
      setError('Por favor completá todos los campos obligatorios (Nombre, DNI, Teléfono, Email, Contraseña y Patente).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const createFleetDriver = httpsCallable(functions, 'createFleetDriverV1');
      await createFleetDriver(formData);
      
      setSuccessMsg(`Chofer ${formData.name} creado correctamente.\nEmail: ${formData.email}\nContraseña: ${formData.password}`);
      setShowAddForm(false);
      setFormData({ name: '', surname: '', dni: '', phone: '', email: '', password: '', vehicleId: '', approved: true });
      loadDrivers();
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error al crear el chofer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  // Block fleet drivers from managing fleets
  if (
    user.driverSubtype === 'fleet_driver' ||
    user.accountOrigin === 'fleet_owner_created' ||
    (user.vehicleOwnerId && user.vehicleOwnerId !== user.uid)
  ) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <VamoIcon name="alert-triangle" className="w-16 h-16 text-yellow-500 mb-6" />
        <h1 className="text-2xl font-bold mb-2">Acceso Denegado</h1>
        <p className="text-zinc-400 text-center max-w-md mb-8">
          Esta sección es solo para titulares de vehículo. Tu cuenta está vinculada como chofer autorizado.
        </p>
        <Link href="/driver">
          <Button className="bg-[#1D7CFF] hover:bg-[#1D7CFF]/80 text-white">Volver al Panel</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <div className="bg-zinc-900/50 border-b border-white/5 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <VamoIcon name="users" className="w-6 h-6 text-[#1D7CFF]" />
              Mi Taxi
            </h1>
            <div className="flex gap-4">
              <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? "outline" : "default"} className={!showAddForm ? "bg-[#1D7CFF] hover:bg-[#1D7CFF]/80 text-white" : "border-white/10 hover:bg-white/5"}>
                {showAddForm ? 'Cancelar' : 'Agregar Chofer'}
              </Button>
              <Link href="/driver" className="flex items-center text-zinc-400 hover:text-white text-sm font-medium transition-colors">Volver</Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 bg-red-950/50 border border-red-500/50 rounded-2xl p-4 flex items-center gap-3">
            <VamoIcon name="alert-triangle" className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}
        
        {successMsg && (
          <div className="mb-4 bg-green-950/50 border border-green-500/50 rounded-2xl p-4 flex items-start gap-3">
            <VamoIcon name="check-circle" className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <p className="text-sm text-green-200 whitespace-pre-wrap">{successMsg}</p>
          </div>
        )}

        {showAddForm && (
          <div className="mb-8 bg-zinc-900 border border-white/5 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <VamoIcon name="user-plus" className="w-5 h-5 text-[#1D7CFF]" />
              Registrar Nuevo Chofer
            </h2>
            <form onSubmit={handleCreateDriver} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Nombre *</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Apellido</Label>
                  <Input value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">DNI *</Label>
                  <Input type="number" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Teléfono *</Label>
                  <Input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Ej: 1123456789" className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Email (Usuario) *</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Contraseña Temporal *</Label>
                  <Input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Para que el chofer ingrese" className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Patente del Vehículo *</Label>
                  <Input value={formData.vehicleId} onChange={e => setFormData({...formData, vehicleId: e.target.value})} placeholder="Ej: AB123CD" className="bg-zinc-950 border-white/10 focus:border-[#1D7CFF] uppercase" />
                </div>
                <div className="flex items-center space-x-3 mt-8 p-4 bg-zinc-950 rounded-xl border border-white/5">
                  <input type="checkbox" id="approved" checked={formData.approved} onChange={e => setFormData({...formData, approved: e.target.checked})} className="h-5 w-5 rounded border-white/20 bg-zinc-900 text-[#1D7CFF] focus:ring-[#1D7CFF]" />
                  <Label htmlFor="approved" className="font-medium text-sm cursor-pointer select-none">Chofer verificado y habilitado para manejar</Label>
                </div>
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-[#1D7CFF] hover:bg-[#1D7CFF]/80 text-white rounded-xl text-base font-bold shadow-lg shadow-[#1D7CFF]/20">
                {isSubmitting ? 'Creando cuenta...' : 'Crear Cuenta y Vincular Chofer'}
              </Button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-[#1D7CFF] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : !loading && drivers.length === 0 && !error ? (
          <div className="bg-zinc-900 border border-white/5 p-12 rounded-2xl flex flex-col items-center justify-center text-center">
            <VamoIcon name="users" className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-bold mb-2">No tenés choferes</h3>
            <p className="text-zinc-400 max-w-sm">Agregá a tus choferes de confianza para que puedan manejar tu vehículo.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <DriverGroup title="Pendientes de Aprobación" icon="clock" drivers={drivers.filter(d => d.fleetApprovalStatus === 'pending')} handleAction={handleAction} onEditAgreement={setEditingDriver} />
            <DriverGroup title="Choferes Habilitados" icon="check-circle" drivers={drivers.filter(d => d.fleetApprovalStatus === 'approved')} handleAction={handleAction} onEditAgreement={setEditingDriver} />
            <DriverGroup title="Suspendidos" icon="pause-circle" drivers={drivers.filter(d => d.fleetApprovalStatus === 'suspended')} handleAction={handleAction} onEditAgreement={setEditingDriver} />
            <DriverGroup title="Desvinculados" icon="x-circle" drivers={drivers.filter(d => d.fleetApprovalStatus === 'unlinked')} handleAction={handleAction} onEditAgreement={setEditingDriver} />
          </div>
        )}

        {/* Payment Agreement Modal */}
        {editingDriver && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-2 text-white">Acuerdo de Pago</h3>
              <p className="text-sm text-zinc-400 mb-4">Configurá el porcentaje de ganancia para el chofer <strong>{editingDriver.name} {editingDriver.surname}</strong>.</p>
              
              <div className="mb-6 p-3 bg-[#1D7CFF]/10 border border-[#1D7CFF]/20 rounded-xl">
                <p className="text-[11px] leading-relaxed text-[#1D7CFF]/80 flex gap-2">
                  <VamoIcon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
                  El porcentaje del chofer se calcula sobre el neto del viaje, luego de descontar comisiones de VamO, tasas municipales o asociaciones.
                </p>
              </div>
              
              <form onSubmit={handleSaveAgreement}>
                <div className="space-y-4 mb-6">
                  <div>
                    <Label className="text-zinc-300">Porcentaje para el Chofer (%)</Label>
                    <Input 
                      type="number" 
                      min="0" max="100" 
                      value={driverShare} 
                      onChange={e => setDriverShare(e.target.value)} 
                      className="mt-1 bg-zinc-950 border-white/10 focus:border-[#1D7CFF]" 
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-500">Porcentaje para el Titular (%)</Label>
                    <Input 
                      type="number" 
                      disabled 
                      value={100 - (parseInt(driverShare) || 0)} 
                      className="mt-1 bg-zinc-950/50 border-white/5 text-zinc-500" 
                    />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button type="button" onClick={() => setEditingDriver(null)} variant="outline" className="flex-1 border-white/10 hover:bg-white/5">Cancelar</Button>
                  <Button type="submit" disabled={isSavingAgreement} className="flex-1 bg-[#1D7CFF] hover:bg-[#1D7CFF]/80">
                    {isSavingAgreement ? 'Guardando...' : 'Guardar Acuerdo'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DriverGroup({ title, icon, drivers, handleAction, onEditAgreement }: { title: string, icon: any, drivers: UserProfile[], handleAction: (id: string, action: 'approve' | 'suspend' | 'unlink') => void, onEditAgreement: (driver: UserProfile) => void }) {
  if (drivers.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden shadow-lg">
      <div className="px-6 py-4 border-b border-white/5 bg-zinc-900/50 flex items-center gap-2">
        <VamoIcon name={icon} className="w-5 h-5 text-zinc-400" />
        <h3 className="text-lg font-bold text-white">{title} <span className="ml-2 text-sm font-medium bg-white/10 px-2 py-0.5 rounded-full">{drivers.length}</span></h3>
      </div>
      <ul className="divide-y divide-white/5">
        {drivers.map(driver => (
          <li key={driver.id} className="p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                <VamoIcon name="user" className="w-6 h-6 text-zinc-500" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">{driver.name} {driver.surname}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                  <p className="text-sm text-zinc-400 flex items-center gap-1"><VamoIcon name="phone" className="w-3 h-3" /> {driver.phone || 'N/A'}</p>
                  <p className="text-sm text-zinc-400 flex items-center gap-1"><VamoIcon name="id-card" className="w-3 h-3" /> {driver.dni || 'N/A'}</p>
                  <p className="text-sm text-zinc-400 flex items-center gap-1"><VamoIcon name="car" className="w-3 h-3" /> {driver.vehicle?.plate || driver.vehicleId || 'Sin asignar'}</p>
                  {(driver as any).paymentAgreement && (
                    <span className="text-xs bg-[#1D7CFF]/20 text-[#1D7CFF] px-2 py-0.5 rounded-full border border-[#1D7CFF]/20">
                      Chofer: {(driver as any).paymentAgreement.driverSharePercent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto mt-2 lg:mt-0">
              {driver.fleetApprovalStatus !== 'approved' && (
                <Button
                  onClick={() => handleAction(driver.id!, 'approve')}
                  className="flex-1 lg:flex-none bg-green-500/10 text-green-500 hover:bg-green-500/20 hover:text-green-400 border border-green-500/20 rounded-xl"
                >
                  <VamoIcon name="check" className="w-4 h-4 mr-2" />
                  Habilitar
                </Button>
              )}
              {driver.fleetApprovalStatus !== 'unlinked' && (
                <Button
                  onClick={() => onEditAgreement(driver)}
                  variant="outline"
                  className="flex-1 lg:flex-none border-blue-500/20 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 rounded-xl"
                >
                  <VamoIcon name="percent" className="w-4 h-4 mr-2" />
                  Acuerdo
                </Button>
              )}
              {driver.fleetApprovalStatus !== 'suspended' && driver.fleetApprovalStatus !== 'unlinked' && (
                <Button
                  onClick={() => handleAction(driver.id!, 'suspend')}
                  variant="outline"
                  className="flex-1 lg:flex-none border-white/10 hover:bg-white/5 text-zinc-300 rounded-xl"
                >
                  <VamoIcon name="pause" className="w-4 h-4 mr-2" />
                  Suspender
                </Button>
              )}
              {driver.fleetApprovalStatus !== 'unlinked' && (
                <Button
                  onClick={() => handleAction(driver.id!, 'unlink')}
                  variant="outline"
                  className="flex-1 lg:flex-none border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 rounded-xl"
                >
                  <VamoIcon name="user-x" className="w-4 h-4 mr-2" />
                  Desvincular
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
