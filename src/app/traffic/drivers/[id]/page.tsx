"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useTelemetry } from "@/lib/telemetry/TelemetryProvider";
import { useParams, useRouter } from "next/navigation";
import { useUser, useFirestore } from "@/firebase";
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  MunicipalProfile,
  MunicipalExpressStatus,
  DocItemStatus,
  UserProfile,
  TrafficObservation,
  MunicipalChecklistKey,
  normalizeDriverDocumentType,
} from "@/lib/types";
import { VamoIcon } from "@/components/VamoIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getFunctions, httpsCallable } from "firebase/functions";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function TrafficDriverDetailPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { profile, user } = useUser();
  const { toast } = useToast();
  const telemetry = useTelemetry();
  const driverId = params.id as string;

  const [mp, setMp] = useState<MunicipalProfile | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [observations, setObservations] = useState<TrafficObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!firestore || !driverId) return;

    const ref = doc(firestore, "municipal_profiles", driverId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setMp(snap.data() as MunicipalProfile);
    });

    const userRef = doc(firestore, "users", driverId);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserProfile);
      setLoading(false);
    });

    const obsQuery = query(
      collection(firestore, "traffic_observations"),
      where("driverId", "==", driverId),
      orderBy("createdAt", "desc")
    );
    const unsubObs = onSnapshot(obsQuery, (snap) => {
      const obsList: TrafficObservation[] = [];
      snap.forEach((doc) => obsList.push(doc.data() as TrafficObservation));
      setObservations(obsList);
    });

    return () => {
      unsub();
      unsubUser();
      unsubObs();
    };
  }, [firestore, driverId]);

  useEffect(() => {
    if (driverId) {
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_driver_detail_loaded',
        metadata: {
          driverId
        }
      });
    }
  }, [driverId]);

  const [reqDocType, setReqDocType] = useState<string>("");
  const [reqReason, setReqReason] = useState<string>("");
  const [reqSeverity, setReqSeverity] = useState<'critical' | 'regularizable' | 'informative'>("regularizable");
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);

  const openRequestModal = (docKey: string, severity: 'regularizable' | 'critical' = 'regularizable') => {
    setReqDocType(docKey);
    setReqSeverity(severity);
    setReqReason(`Por favor, renovar y actualizar el documento: ${formatLabel(docKey)}`);
    setIsReqModalOpen(true);
  };

  const handleRequestDocument = async () => {
    if (!reqDocType || !reqReason) return;
    setBusy(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const createObs = httpsCallable(functions, "createTrafficObservationV1");
      await createObs({
        driverId,
        severity: reqSeverity,
        documentType: reqDocType,
        reason: reqReason,
      });
      toast({
        title: "Observación Creada",
        description: `Se ha registrado la observación y notificado al conductor.`,
      });
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_observation_created',
        metadata: {
          driverId,
          documentType: reqDocType,
          severity: reqSeverity,
          reason: reqReason
        }
      });
      setIsReqModalOpen(false);
      setReqDocType("");
      setReqReason("");
      setReqSeverity("regularizable");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    const reason = prompt("Ingrese el motivo de la suspensión preventiva:");
    if (reason === null) return; // Cancelado
    if (!reason.trim()) {
      alert("Debes ingresar un motivo para suspender al conductor.");
      return;
    }
    setBusy(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const updateStatus = httpsCallable(
        functions,
        "updateTrafficSuspensionV1",
      );
      await updateStatus({
        driverId,
        action: "suspend",
        reason: reason.trim(),
      });
      toast({
        title: "Conductor Suspendido",
        description: "Se ha emitido la suspensión preventiva.",
      });
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_driver_suspended',
        metadata: {
          driverId,
          reason: reason.trim(),
        }
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLiftSuspension = async () => {
    if (!confirm("¿Levantar la suspensión preventiva de este conductor?")) return;
    setBusy(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const updateStatus = httpsCallable(
        functions,
        "updateTrafficSuspensionV1",
      );
      await updateStatus({
        driverId,
        action: "unsuspend",
      });
      toast({
        title: "Suspensión Levantada",
        description: "El conductor ha sido reactivado.",
      });
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_suspension_lifted',
        metadata: {
          driverId,
          reason: "Suspensión preventiva levantada por Control de Tránsito."
        }
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleObservation = async () => {
    const obs = prompt("Ingrese la observación municipal:");
    if (!obs) return;
    setBusy(true);
    try {
      const ref = doc(firestore!, "municipal_profiles", driverId);
      await updateDoc(ref, {
        municipalObservation: obs,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Observación Registrada" });
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_observation_saved',
        metadata: {
          driverId,
          observation: obs
        }
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleChecklistItem = async (
    key: string,
    newStatus: DocItemStatus,
    obs?: string,
    expiryDate?: string,
  ) => {
    if (!mp) return;
    setBusy(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const updateItem = httpsCallable(functions, "updateMunicipalChecklistItemV1");
      await updateItem({
        driverId,
        key,
        status: newStatus,
        observation: obs,
        expiryDate,
      });

      toast({
        title: `${formatLabel(key)} — ${newStatus === "approved" ? "Aprobado" : "Observado"}`,
      });

      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_document_reviewed',
        metadata: {
          driverId,
          key,
          status: newStatus,
          observation: obs || null,
          expiryDate: expiryDate || null
        }
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );

  if (!userData)
    return (
      <div className="py-20 text-center text-zinc-500 space-y-4">
        <VamoIcon name="search" className="w-12 h-12 mx-auto opacity-20" />
        <p>No se encontró información del conductor.</p>
        <Link href="/traffic/drivers">
          <Button variant="outline" className="rounded-xl border-white/5">
            Volver
          </Button>
        </Link>
      </div>
    );

  const isGlobalAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const hasMismatch = userData && profile && !isGlobalAdmin && (profile.cityKey !== userData.cityKey);

  if (hasMismatch) {
    return (
      <div className="py-40 text-center space-y-6 max-w-md mx-auto">
        <VamoIcon name="shield-off" className="w-16 h-16 mx-auto text-rose-500 animate-bounce" />
        <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">Jurisdicción Restringida</h2>
        <p className="text-xs text-zinc-400 leading-relaxed font-medium">
          No posees los permisos necesarios para visualizar ni fiscalizar conductores asignados a otras ciudades.
        </p>
        <Link href="/traffic/drivers">
          <Button className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-black rounded-xl">
            VOLVER A CONDUCTORES
          </Button>
        </Link>
      </div>
    );
  }

  const isLegacyTraffic = userData?.municipalStatus === 'suspended_by_traffic' || mp?.municipalStatus === 'suspended_by_traffic';
  const isSuspendedTop = !!userData?.isSuspended || !!userData?.trafficSuspended || !!userData?.municipalSuspended || !!userData?.adminSuspended || !!mp?.isSuspended || !!mp?.trafficSuspended || !!mp?.municipalSuspended || !!mp?.adminSuspended || isLegacyTraffic;
  const suspensionSourceTop = userData?.suspensionSource || mp?.suspensionSource || (userData?.adminSuspended ? 'admin' : (userData?.municipalSuspended ? 'municipal' : (userData?.trafficSuspended ? 'traffic' : null))) || (mp?.adminSuspended ? 'admin' : (mp?.municipalSuspended ? 'municipal' : (mp?.trafficSuspended ? 'traffic' : null))) || (isLegacyTraffic ? 'traffic' : null);

  const isTrafficSuspended = isSuspendedTop && suspensionSourceTop === 'traffic';
  const isMunicipalSuspended = isSuspendedTop && suspensionSourceTop === 'municipal';
  const trafficReason = userData?.trafficSuspensionReason || mp?.municipalObservation || "Suspensión operativa por control de Tránsito";
  const requestedDocType = mp?.lastTrafficRequest?.documentType;
  const requestedDocStatus = requestedDocType ? mp?.checklist?.[requestedDocType]?.status : null;


  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-[2rem] bg-zinc-900 border border-white/5 flex items-center justify-center text-3xl font-black text-white italic shadow-2xl">
            {userData.name?.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                {userData.name}
              </h1>
              <StatusBadge
                status={
                  isTrafficSuspended ? 'traffic_observed' :
                  isMunicipalSuspended ? 'municipal_observed' :
                  isSuspendedTop ? 'admin_suspended' :
                  (mp?.municipalStatus || userData.municipalStatus || "pending")
                }
              />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-1">
              {userData.email} · {userData.phone || "Sin teléfono"}
            </p>
            <div className="flex gap-2 mt-3">
              <Badge
                variant="outline"
                className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[9px] font-black uppercase tracking-widest"
              >
                {userData.driverSubtype === 'express' ? 'PARTICULAR' : userData.driverSubtype === 'professional' ? 'TAXI / REMIS' : 'PARTICULAR'}
              </Badge>
              {mp?.municipalCode && (
                <Badge
                  variant="outline"
                  className="bg-zinc-800 text-zinc-400 border-white/5 text-[9px] font-bold font-mono tracking-widest"
                >
                  {mp.municipalCode}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'traffic_municipal' || profile?.role === 'admin_municipal' || profile?.role === 'traffic_admin') && (
          <div className="flex gap-2">
            <Dialog open={isReqModalOpen} onOpenChange={setIsReqModalOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-2xl bg-white text-black font-black hover:bg-zinc-200">
                PEDIR DOCUMENTACIÓN
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-white/10 text-white rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter">
                  Solicitar Documento
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Tipo de Documento
                  </label>
                  <Select onValueChange={setReqDocType} value={reqDocType}>
                    <SelectTrigger className="bg-white/5 border-white/5 rounded-xl h-12">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="driverLicense">
                        Licencia de Conducir
                      </SelectItem>
                      <SelectItem value="vehicleInsurance">
                        Seguro Vigente
                      </SelectItem>
                      <SelectItem value="vehicleRegistrationCard">
                        Cédula
                      </SelectItem>
                      <SelectItem value="criminalRecord">
                        Antecedentes
                      </SelectItem>
                      <SelectItem value="dniFront">DNI (Frente)</SelectItem>
                      <SelectItem value="disinfectionReceipt">
                        Certificado de Desinfección
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Gravedad (Plazo)
                  </label>
                  <Select onValueChange={(val: any) => setReqSeverity(val)} value={reqSeverity}>
                    <SelectTrigger className="bg-white/5 border-white/5 rounded-xl h-12">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      <SelectItem value="regularizable">
                        Regularizable (Da 24 hs de plazo)
                      </SelectItem>
                      <SelectItem value="critical">
                        Crítica (Suspende de inmediato)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Motivo de la Solicitud
                  </label>
                  <Textarea
                    placeholder="Ej: Documento vencido o ilegible..."
                    className="bg-white/5 border-white/5 rounded-xl min-h-[100px]"
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                  />
                </div>
                <Button
                  className={`w-full h-14 rounded-2xl font-black ${reqSeverity === 'critical' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                  disabled={busy || !reqDocType}
                  onClick={handleRequestDocument}
                >
                  {reqSeverity === 'critical' ? 'SUSPENDER Y PEDIR DOC' : 'ENVIAR INTIMACIÓN (24 HS)'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {/* EXPLICIT TRAFFIC OBSERVATION CARD */}
      {isTrafficSuspended && (
        <Card className="rounded-[2rem] border-red-500/20 bg-red-500/10 shadow-lg shadow-red-500/5 p-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-xl font-black text-red-400 uppercase tracking-tighter flex items-center gap-2">
                <VamoIcon name="alert-triangle" className="w-6 h-6" /> Tránsito inhabilitó preventivamente a este conductor
              </h2>
              <div className="text-sm font-semibold text-zinc-300">
                <p>Motivo: <span className="italic text-zinc-400">"{trafficReason}"</span></p>
                {requestedDocType && (
                  <p className="mt-1 flex items-center gap-2">
                    Documento Requerido: <span className="text-white bg-white/10 px-2 py-0.5 rounded font-mono text-[10px]">{requestedDocType}</span>
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${requestedDocStatus === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : requestedDocStatus === 'pending' || requestedDocStatus === 'submitted' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                      Estado: {requestedDocStatus === 'submitted' ? 'EN REVISIÓN' : requestedDocStatus || 'Sin cargar'}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 w-full md:w-auto">
              {requestedDocStatus === 'approved' ? (
                <Button
                  disabled={busy}
                  onClick={handleLiftSuspension}
                  className="w-full md:w-auto h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white border-none font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-600/20 animate-pulse"
                >
                  REHABILITAR CONDUCTOR
                </Button>
              ) : requestedDocStatus === 'pending' || requestedDocStatus === 'submitted' ? (
                 <div className="text-center md:text-right border border-amber-500/20 bg-amber-500/10 p-3 rounded-xl">
                   <p className="text-[10px] uppercase font-black text-amber-500">Documento en revisión</p>
                   <p className="text-[10px] text-amber-400/80">Aprobá el documento abajo para rehabilitar.</p>
                 </div>
              ) : (
                <div className="text-center md:text-right border border-white/5 bg-black/20 p-3 rounded-xl opacity-80">
                  <p className="text-[10px] uppercase font-black text-zinc-400">Esperando carga del conductor</p>
                  <p className="text-[10px] text-zinc-500">No es posible rehabilitar aún.</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {isMunicipalSuspended && (
        <Card className="rounded-[2rem] border-red-500/10 bg-zinc-900/50 p-6 text-center animate-in fade-in slide-in-from-top-4">
            <h2 className="text-base font-black text-red-400 uppercase tracking-wider mb-2">
                Suspensión Municipal
            </h2>
            <p className="text-xs text-zinc-400">Este conductor fue deshabilitado por Municipalidad. Requiere revisión municipal central.</p>
        </Card>
      )}

      {isSuspendedTop && !suspensionSourceTop && (
        <Card className="rounded-[2rem] border-orange-500/20 bg-orange-500/10 p-6 text-center animate-in fade-in slide-in-from-top-4">
            <h2 className="text-base font-black text-orange-400 uppercase tracking-wider mb-2 flex items-center justify-center gap-2">
                <VamoIcon name="alert-triangle" className="w-5 h-5" /> Inconsistencia de Estado
            </h2>
            <p className="text-xs text-zinc-300">El conductor figura inhabilitado operativamente pero no se registra el origen (Tránsito, Admin o Municipalidad). Requiere revisión técnica o de Administración.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* INFO COL */}
        <div className="lg:col-span-2 space-y-8">
          {/* VEHICLE CARD */}
          <Card className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tighter uppercase italic text-zinc-400 flex items-center gap-2">
                <VamoIcon name="car" className="w-4 h-4" /> Información del
                Vehículo
              </h2>
            </div>
            <CardContent className="p-8 grid grid-cols-2 gap-8">
              <InfoField
                label="Marca / Modelo"
                value={userData.vehicleModel || "N/A"}
              />
              <InfoField
                label="Patente"
                value={userData.plateNumber || "SIN PATENTE"}
                highlight
              />
              <InfoField label="Año" value={userData.carModelYear || "N/A"} />
              <InfoField
                label="Tipo de Servicio"
                value={userData.driverSubtype || "EXPRESS"}
              />
            </CardContent>
          </Card>

          {/* VENCIMIENTOS DOCUMENTALES */}
          <Card className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tighter uppercase italic text-zinc-400 flex items-center gap-2">
                <VamoIcon name="file-text" className="w-4 h-4" /> Vencimientos Documentales
              </h2>
            </div>
            <CardContent className="p-0 divide-y divide-white/5">
              {!mp ? (
                <div className="p-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs italic">
                  El conductor aún no ha iniciado su legajo municipal.
                </div>
              ) : (
                ['driverLicense', 'vehicleInsurance', 'technicalInspection', 'vehicleRegistrationCard', 'criminalRecord', 'municipalCanon', 'municipalHabilitation', 'disinfectionReceipt', 'passengerCoverageInsurance'].map(
                  (rawKey) => {
                    const key = normalizeDriverDocumentType(rawKey);
                    // Normalizar todo el checklist para soportar alias (ej. 'antecedentes' -> 'criminalRecord')
                    const normalizedChecklist: Record<string, any> = {};
                    if (mp?.checklist) {
                      Object.keys(mp.checklist).forEach(k => {
                        const nk = normalizeDriverDocumentType(k);
                        // Preferimos 'approved' si hay colisión
                        if (normalizedChecklist[nk]?.status !== 'approved') {
                          normalizedChecklist[nk] = mp.checklist[k as MunicipalChecklistKey];
                        }
                      });
                    }

                    const item = normalizedChecklist[key] || mp.checklist?.[rawKey as MunicipalChecklistKey] || { status: 'missing' };
                    // Fallbacks desde la raiz del legajo municipal (legacy)
                    const getRootExpiry = (k: string) => {
                        switch(k) {
                            case 'driverLicense': return mp.licenseExpiry;
                            case 'vehicleInsurance': return mp.insuranceExpiry;
                            case 'technicalInspection': return mp.itvExpiry;
                            case 'criminalRecord': return mp.backgroundCheckExpiry;
                            case 'municipalCanon': return mp.canonExpiry;
                            case 'municipalHabilitation': return mp.habilitationExpiry; // Si existe
                            default: return null;
                        }
                    };

                    let finalExpiryStr = item.expiryDate;
                    let rootSourceUsed = false;
                    
                    if (!finalExpiryStr) {
                        const rootExpiry = getRootExpiry(key);
                        if (rootExpiry) {
                            finalExpiryStr = rootExpiry.toDate ? rootExpiry.toDate().toISOString() : new Date(rootExpiry).toISOString();
                            rootSourceUsed = true;
                        }
                    }

                    let expiryState = item.status === 'missing' ? 'missing' : 'pending';
                    let daysLeft: number | null = null;
                    
                    if (item.status === 'approved') {
                        if (finalExpiryStr) {
                            const d = new Date(finalExpiryStr);
                            // Fix timezone diff for accurate days
                            d.setHours(23, 59, 59, 999);
                            const now = new Date();
                            daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
                            if (daysLeft < 0) expiryState = 'expired';
                            else if (daysLeft <= 15) expiryState = 'expiring_soon';
                            else expiryState = 'valid';
                        } else {
                            // Está aprobado pero NO tiene fecha de vencimiento cargada en ningún lado
                            expiryState = 'approved_no_date';
                        }
                    } else if (item.status === 'observed') {
                        expiryState = 'observed';
                    } else if (item.status === 'pending_traffic_review') {
                        expiryState = 'review';
                    }

                    const stateColor = 
                        expiryState === 'valid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        expiryState === 'approved_no_date' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        expiryState === 'expiring_soon' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                        expiryState === 'expired' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        expiryState === 'observed' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                        expiryState === 'review' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-zinc-800/50 text-zinc-500 border-zinc-700';

                    const stateLabel = 
                        expiryState === 'valid' ? 'Vigente' :
                        expiryState === 'approved_no_date' ? 'Aprobado — sin vencimiento registrado' :
                        expiryState === 'expiring_soon' ? 'Por Vencer' :
                        expiryState === 'expired' ? 'Vencido' :
                        expiryState === 'observed' ? 'Observado' :
                        expiryState === 'review' ? 'En Revisión' :
                        'Faltante';

                    return (
                    <div
                      key={key}
                      className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center border shrink-0",
                            stateColor
                          )}
                        >
                          <VamoIcon
                            name={(expiryState === 'valid' || expiryState === 'approved_no_date') ? "check" : expiryState === 'expired' ? "alert-octagon" : expiryState === 'observed' ? "alert-triangle" : "file"}
                            className="w-6 h-6"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-200 uppercase tracking-tight">
                            {formatLabel(key)}
                          </p>
                          <div className="flex flex-col gap-1 mt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded", stateColor)}>
                                {stateLabel}
                              </span>
                              {finalExpiryStr && (
                                <span className="text-[10px] font-mono text-zinc-400">
                                  Vto: {new Date(finalExpiryStr).toLocaleDateString()} 
                                  {daysLeft !== null && <span className="ml-1 font-bold">({daysLeft < 0 ? 'Hace ' + Math.abs(daysLeft) : 'En ' + daysLeft} días)</span>}
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                              Fuente: {rootSourceUsed ? 'Raíz del legajo municipal' : (item.status !== 'missing' ? 'Documento municipal cargado' : 'Falta cargar')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center justify-end">
                        {item.storageUrl && (
                          <a
                            href={item.storageUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg text-[10px] font-black uppercase text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/10"
                            >
                              VER
                            </Button>
                          </a>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'traffic_municipal' || profile?.role === 'admin_municipal' || profile?.role === 'traffic_admin' || profile?.role === 'traffic_operator') && (
                          <>
                            {item.status !== "approved" && item.status !== "missing" && (
                              <ApproveItemButton
                                keyId={key}
                                disabled={busy}
                                needsExpiry={[
                                  "driverLicense",
                                  "vehicleInsurance",
                                  "criminalRecord",
                                  "municipalCanon",
                                  "passengerCoverageInsurance"
                                ].includes(key)}
                                onConfirm={(expiry) =>
                                  handleChecklistItem(
                                    key,
                                    "approved",
                                    undefined,
                                    expiry,
                                  )
                                }
                              />
                            )}
                            
                            {(expiryState === 'valid' || expiryState === 'expiring_soon' || expiryState === 'missing') && (
                                <Button
                                  disabled={busy}
                                  onClick={() => openRequestModal(key, 'regularizable')}
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-lg text-[10px] font-black uppercase text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/20"
                                >
                                  SOLICITAR RENOVACIÓN
                                </Button>
                            )}

                            {expiryState === 'expired' && (
                                <Button
                                  disabled={busy}
                                  onClick={() => openRequestModal(key, 'critical')}
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-lg text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 hover:text-red-400 border border-red-500/20"
                                >
                                  SUSPENDER (VENCIDO)
                                </Button>
                            )}

                            {item.status === "observed" && (
                              <span className="text-[10px] uppercase font-bold text-orange-500 underline decoration-orange-500/30 cursor-pointer hover:text-orange-400" onClick={() => handleChecklistItem(key, 'pending')}>
                                Revertir
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                 }
                )
              )}
            </CardContent>
          </Card>
        </div>

        {/* ASIDE COL */}
        <div className="space-y-8">
          {/* MUNICIPAL STATUS */}
          <Card className="rounded-[2.5rem] border-white/5 bg-gradient-to-br from-indigo-900/20 to-transparent p-8">
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-6 italic">
              Fiscalización
            </h3>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">
                  Última Revisión
                </p>
                <p className="text-sm font-bold text-zinc-200">
                  {mp?.updatedAt
                    ? new Date(mp.updatedAt.toDate()).toLocaleDateString()
                    : "Nunca"}
                </p>
              </div>
              {(profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'traffic_municipal' || profile?.role === 'admin_municipal' || profile?.role === 'traffic_admin' || profile?.role === 'traffic_operator' || profile?.role === 'traffic') && (
                <div className="pt-6 border-t border-white/5 space-y-4">
                  {(() => {
                    const isLegacyTraffic = userData?.municipalStatus === 'suspended_by_traffic' || mp?.municipalStatus === 'suspended_by_traffic';
                    const isSuspended = !!userData?.isSuspended || !!userData?.trafficSuspended || !!userData?.municipalSuspended || !!userData?.adminSuspended || !!mp?.isSuspended || !!mp?.trafficSuspended || !!mp?.municipalSuspended || !!mp?.adminSuspended || isLegacyTraffic;
                    const suspensionSource = userData?.suspensionSource || mp?.suspensionSource || (userData?.adminSuspended ? 'admin' : (userData?.municipalSuspended ? 'municipal' : (userData?.trafficSuspended ? 'traffic' : null))) || (mp?.adminSuspended ? 'admin' : (mp?.municipalSuspended ? 'municipal' : (mp?.trafficSuspended ? 'traffic' : null))) || (isLegacyTraffic ? 'traffic' : null);

                    const canLift = suspensionSource === 'traffic' || isGlobalAdmin;

                    return (
                      <div className="space-y-4">
                        {isSuspended && (
                          <div className="p-3 text-center rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-wider">
                              Suspendido por: {suspensionSource === 'admin' ? 'Administración' : suspensionSource === 'municipal' ? 'Municipalidad' : 'Tránsito'}
                            </p>
                            {(() => {
                              const reason = userData?.adminSuspensionReason || userData?.municipalSuspensionReason || userData?.trafficSuspensionReason || userData?.suspensionReason || mp?.municipalObservation;
                              if (reason) {
                                return (
                                  <p className="text-[10px] text-zinc-400 italic">
                                    "{reason}"
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}

                        {isSuspended ? (
                          canLift ? (
                            <Button
                              disabled={busy}
                              onClick={handleLiftSuspension}
                              className="w-full h-12 rounded-xl bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 font-black text-xs hover:bg-emerald-600/20 animate-pulse"
                            >
                              REHABILITAR CONDUCTOR
                            </Button>
                          ) : (
                            <div className="p-3 text-center rounded-xl bg-zinc-500/5 border border-white/5 space-y-1">
                              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                                Bloqueado por: {suspensionSource === 'admin' ? 'ADMINISTRACIÓN VAMO' : 'MUNICIPALIDAD'}
                              </p>
                              <p className="text-[9px] text-zinc-600 uppercase font-semibold">
                                Sin atribución para reactivar
                              </p>
                            </div>
                          )
                        ) : (
                          <Button
                            disabled={busy}
                            onClick={handleSuspend}
                            className="w-full h-12 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 font-black text-xs hover:bg-red-600/20"
                          >
                            SUSPENDER PREVENTIVAMENTE
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={handleObservation}
                    className="w-full h-12 rounded-xl text-zinc-600 font-bold text-xs uppercase tracking-widest"
                  >
                    Registrar Observación
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* VENCIMIENTOS QUICK VIEW - HIDDEN IN FAVOR OF FULL LIST ABOVE */}
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value, highlight }: any) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-black tracking-tight italic",
          highlight ? "text-indigo-400" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: any = {
    approved: {
      label: "Habilitado",
      cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    },
    active: {
      label: "✓ Habilitado",
      cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    },
    pending: {
      label: "Pendiente",
      cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    },
    pending_review: {
      label: "En Revisión",
      cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    },
    suspended_by_municipality: {
      label: "Suspendido por Municipio",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    suspended_by_traffic: {
      label: "Suspendido por Tránsito",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    traffic_observed: {
      label: "OBSERVADO POR TRÁNSITO",
      cls: "bg-amber-500/20 text-amber-500 border-amber-500/30",
    },
    municipal_observed: {
      label: "OBSERVADO POR MUNICIPALIDAD",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    admin_suspended: {
      label: "BLOQUEADO (ADMIN)",
      cls: "bg-red-500/20 text-red-500 border-red-500/40",
    },
    suspended: {
      label: "Suspendido",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    suspended_expired_license: {
      label: "Licencia Vencida",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    suspended_expired_insurance: {
      label: "Seguro Vencido",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    suspended_unpaid_canon: {
      label: "Canon Impago",
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
  };
  const cfg = config[status] || {
    label: status,
    cls: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  };
  return (
    <Badge
      className={`${cfg.cls} rounded-lg font-black text-[10px] uppercase tracking-widest px-3 py-1.5`}
    >
      {cfg.label}
    </Badge>
  );
}

function ExpiryItem({ label, date }: any) {
  if (!date) return null;
  const d = date.toDate ? date.toDate() : new Date(date);
  const expired = d < new Date();
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-zinc-500 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-black italic",
          expired ? "text-red-500" : "text-zinc-200",
        )}
      >
        {d.toLocaleDateString()}
      </span>
    </div>
  );
}

function formatLabel(key: string) {
  const labels: any = {
    dniFront: "DNI Frente",
    dniBack: "DNI Dorso",
    driverLicense: "Licencia de Conducir",
    professionalLicense: "Licencia Profesional",
    vehicleInsurance: "Seguro del Vehículo",
    technicalInspection: "RTO / VTV",
    vehicleRegistrationCard: "Cédula",
    criminalRecord: "Antecedentes Penales",
    municipalCanon: "Canon Municipal",
    municipalHabilitation: "Habilitación Municipal",
    disinfectionReceipt: "Certificado de Desinfección",
    passengerCoverageInsurance: "Cobertura de Pasajero",
  };
  return labels[key] || key;
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

function ApproveItemButton({
  keyId,
  disabled,
  needsExpiry,
  onConfirm,
  label = "✓ Aprobar",
  className,
}: {
  keyId?: string;
  disabled: boolean;
  needsExpiry: boolean;
  onConfirm: (exp?: string) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Predeterminar +30 días
  const initialExpiry = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }, []);

  const [expiry, setExpiry] = useState(initialExpiry);

  if (!open)
    return (
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "h-7 text-[10px] font-black uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20",
          className,
        )}
      >
        {label}
      </Button>
    );

  return (
    <div className="flex gap-2 items-center flex-1 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
      {needsExpiry ? (
        <div className="flex flex-col gap-1.5 flex-1">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
            Nueva fecha de vencimiento:
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="flex-1 h-8 text-xs bg-black/40 border border-white/10 rounded-lg px-2 text-white focus:outline-none focus:border-emerald-500/50"
            />
            <button
              disabled={!expiry}
              onClick={() => {
                onConfirm(expiry);
                setOpen(false);
              }}
              className="h-8 px-4 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-lg disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-8 px-2 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            className="h-8 px-4 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-lg"
          >
            Confirmar aprobación
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-8 px-2 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase font-bold"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function ObserveItemButton({
  disabled,
  onObserve,
}: {
  disabled: boolean;
  onObserve: (obs: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-7 text-[10px] font-black uppercase tracking-widest bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20"
      >
        ⚠ Observar
      </Button>
    );
  return (
    <div className="flex gap-2 items-center flex-1">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Motivo de la observación..."
        className="flex-1 h-7 text-xs bg-white/[0.04] border border-white/10 rounded-lg px-2 text-zinc-300 placeholder:text-zinc-700 focus:outline-none"
      />
      <button
        onClick={() => {
          onObserve(text);
          setOpen(false);
          setText("");
        }}
        className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2"
      >
        OK
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-[10px] text-zinc-600 hover:text-zinc-400 px-1"
      >
        ✕
      </button>
    </div>
  );
}
