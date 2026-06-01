"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useTelemetry } from "@/lib/telemetry/TelemetryProvider";
import { useParams, useRouter } from "next/navigation";
import { useUser, useFirestore } from "@/firebase";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  MunicipalProfile,
  MunicipalExpressStatus,
  DocItemStatus,
  UserProfile,
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

    return () => {
      unsub();
      unsubUser();
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
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);

  const handleRequestDocument = async () => {
    if (!reqDocType) return;
    setBusy(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const requestDoc = httpsCallable(functions, "requestDriverDocumentV1");
      await requestDoc({
        targetUid: driverId,
        documentType: reqDocType,
        reason: reqReason,
      });
      toast({
        title: "Solicitud Enviada",
        description: `Se ha solicitado ${formatLabel(reqDocType)} al conductor.`,
      });
      telemetry.trackEvent({
        type: 'municipal_operation',
        eventName: 'traffic_document_requested',
        metadata: {
          driverId,
          documentType: reqDocType,
          reason: reqReason
        }
      });
      setIsReqModalOpen(false);
      setReqDocType("");
      setReqReason("");
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
                  mp?.municipalStatus || userData.municipalStatus || "pending"
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
                  className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black"
                  disabled={busy || !reqDocType}
                  onClick={handleRequestDocument}
                >
                  ENVIAR SOLICITUD FORMAL
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

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

          {/* DOCUMENTATION CHECKLIST */}
          <Card className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
            <div className="p-8 border-b border-white/5">
              <h2 className="text-lg font-black tracking-tighter uppercase italic text-zinc-400 flex items-center gap-2">
                <VamoIcon name="file-text" className="w-4 h-4" /> Documentación
                Digital
              </h2>
            </div>
            <CardContent className="p-0 divide-y divide-white/5">
              {!mp ? (
                <div className="p-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs italic">
                  El conductor aún no ha iniciado su legajo municipal.
                </div>
              ) : (
                Object.entries(mp.checklist || {}).map(
                  ([key, item]: [string, any]) => (
                    <div
                      key={key}
                      className="p-6 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border",
                            item.status === "approved"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                              : "bg-zinc-900 border-white/5 text-zinc-600",
                          )}
                        >
                          <VamoIcon
                            name={item.status === "approved" ? "check" : "file"}
                            className="w-5 h-5"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-200 uppercase tracking-tight">
                            {formatLabel(key)}
                          </p>
                          <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">
                            {item.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {item.storageUrl && (
                          <a
                            href={item.storageUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg text-[10px] font-black uppercase text-indigo-400"
                            >
                              VER
                            </Button>
                          </a>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'traffic_municipal' || profile?.role === 'admin_municipal' || profile?.role === 'traffic_admin' || profile?.role === 'traffic_operator') && (
                          <div className="flex gap-2 flex-wrap items-center">
                            {item.status !== "approved" && (
                              <ApproveItemButton
                                keyId={key}
                                disabled={busy}
                                needsExpiry={[
                                  "driverLicense",
                                  "vehicleInsurance",
                                  "criminalRecord",
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
                            {item.status !== "observed" && (
                              <ObserveItemButton
                                disabled={busy}
                                onObserve={(obs) =>
                                  handleChecklistItem(key, "observed", obs)
                                }
                              />
                            )}
                            {item.status === "approved" && (
                              <button
                                disabled={busy}
                                onClick={() => handleChecklistItem(key, "observed")}
                                className="text-[10px] text-zinc-600 hover:text-orange-400 underline transition-colors"
                              >
                                Revertir a observado
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ),
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
                              LEVANTAR SUSPENSIÓN PREVENTIVA
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

          {/* VENCIMIENTOS QUICK VIEW */}
          {mp && (
            <Card className="rounded-[2.5rem] border-white/5 bg-zinc-900/30 p-8 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 italic">
                Vencimientos Clave
              </h3>
              <div className="space-y-4">
                <ExpiryItem label="Licencia" date={mp.licenseExpiry} />
                <ExpiryItem label="Seguro" date={mp.insuranceExpiry} />
                <ExpiryItem label="Canon" date={mp.canonExpiry} />
              </div>
            </Card>
          )}
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
    vehicleInsurance: "Seguro del Vehículo",
    vehicleRegistrationCard: "Cédula",
    criminalRecord: "Antecedentes Penales",
    municipalCanon: "Canon Municipal",
    disinfectionReceipt: "Certificado de Desinfección",
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
