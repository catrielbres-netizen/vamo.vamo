import React from 'react';
import { UserProfile, MunicipalProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface LinkedDriverPanelProps {
  userData: UserProfile | null;
  mp: MunicipalProfile | null;
}

export function LinkedDriverPanel({ userData, mp }: LinkedDriverPanelProps) {
  if (!userData && !mp) return null;

  const isFleetDriver = userData?.driverSubtype === 'fleet_driver' || mp?.driverSubtype === 'fleet_driver';
  const isOwner = userData?.isVehicleOwner || (userData?.authorizedDriverIds && userData.authorizedDriverIds.length > 0);
  const ownerRef = userData?.vehicleOwnerId;
  const authorizedDrivers = userData?.authorizedDriverIds || [];

  const vehicle = userData?.vehicle;
  const plate = vehicle?.plate || userData?.plateNumber || 'No informada';
  const vehicleDesc = vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year ? `(${vehicle.year})` : ''}` : 'No informado';

  if (!isFleetDriver && !isOwner) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
            Relación Titular / Chofer
          </p>
          <Badge className="bg-zinc-800 text-zinc-500 border-none text-[10px] uppercase font-black">Sin vínculo</Badge>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm font-bold text-white mb-1.5">Sin vínculo titular/chofer registrado</p>
          <p className="text-xs text-zinc-500">Este conductor no tiene actualmente un titular asociado ni choferes vinculados autorizados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center">
        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
          Relación Titular / Chofer
        </p>
        {isOwner ? (
          <Badge className="bg-indigo-500/20 text-indigo-400 border-none text-[10px] uppercase font-black">Titular del Vehículo</Badge>
        ) : (
          <Badge className="bg-amber-500/20 text-amber-400 border-none text-[10px] uppercase font-black">Chofer Vinculado</Badge>
        )}
      </div>

      <div className="p-5 space-y-4">
        {isOwner ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Vehículo</p>
                <p className="text-sm font-bold text-white">{vehicleDesc}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Patente</p>
                <p className="text-sm font-bold text-white font-mono">{plate}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-2">Choferes vinculados autorizados</p>
              <div className="grid grid-cols-1 gap-2">
                {authorizedDrivers.length ? (
                  authorizedDrivers.map(driverId => (
                    <div key={driverId} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">{driverId}</p>
                        <p className="text-[10px] text-zinc-600 font-bold uppercase">Chofer Autorizado</p>
                      </div>
                      <Link href={`/municipal/drivers/${driverId}`}>
                        <Button variant="ghost" size="sm" className="text-indigo-400 hover:text-indigo-300 text-[10px] font-black uppercase">Ver Perfil</Button>
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 border border-dashed border-white/10 rounded-xl text-zinc-600 text-xs italic">
                    No hay choferes autorizados cargados.
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
               <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Estado</p>
                  <p className="text-xs font-bold text-white">{mp?.municipalStatus ? mp.municipalStatus.replace(/_/g, ' ') : 'Desconocido'}</p>
               </div>
               <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Documentación</p>
                  <p className="text-xs font-bold text-zinc-400">Ver panel superior</p>
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 mb-1">Referencia del Titular</p>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">{ownerRef || 'No informada'}</p>
                {ownerRef && ownerRef.length > 10 && (
                  <Link href={`/municipal/drivers/${ownerRef}`}>
                    <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300 text-[10px] font-black uppercase">Ver Perfil</Button>
                  </Link>
                )}
              </div>
              {ownerRef && ownerRef.length <= 10 && (
                <p className="text-[10px] text-zinc-500 mt-1">Titular informado: {ownerRef}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Vehículo Asociado</p>
                <p className="text-sm font-bold text-white">{vehicleDesc}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Patente</p>
                <p className="text-sm font-bold text-white font-mono">{plate}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
               <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Estado del Vínculo</p>
                  <Badge className="bg-blue-500/10 text-blue-400 border-none text-[9px] uppercase font-bold">Informativo</Badge>
               </div>
               <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Doc. del Chofer</p>
                  <p className="text-xs font-bold text-zinc-400">Ver panel superior</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
