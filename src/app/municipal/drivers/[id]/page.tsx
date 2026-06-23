"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser, useFirestore } from "@/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  MunicipalProfile,
  MunicipalExpressStatus,
  MunicipalChecklist,
  MunicipalChecklistKey,
  DocItemStatus,
  CanonStatus,
  normalizeCityKey,
  MunicipalAuditAction,
  UserProfile,
} from "@/lib/types";
import { syncPublicDriverProfile } from "@/lib/driver-public";
import { VamoIcon } from "@/components/VamoIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useMunicipalContext } from "@/hooks/useMunicipalContext";
import { Badge } from "@/components/ui/badge";
import { LinkedDriverPanel } from "@/components/municipal/LinkedDriverPanel";
import { CITIES } from "@/lib/cityData";
import { CheckCircle2, AlertCircle } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const CHECKLIST_LABELS: Record<MunicipalChecklistKey, string> = {
  dniFront: "DNI — Frente",
  dniBack: "DNI — Dorso",
  driverLicense: "Licencia de conducir",
  vehicleInsurance: "Seguro del vehículo",
  passengerCoverageInsurance: "Cobertura pasajeros — Seguros Rivadavia",
  vehicleRegistrationCard: "Cédula del vehículo",
  criminalRecord: "Antecedentes penales vigentes",
  municipalCanon: "Canon municipal",
  disinfectionReceipt: "Certificado de Desinfección",
  vehicleModelYearProof: "Comprobante de modelo/año del vehículo",
};
const CHECKLIST_KEYS = Object.keys(CHECKLIST_LABELS) as MunicipalChecklistKey[];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(ts: any) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isExpired(ts: any): boolean {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.getTime() < Date.now();
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DocStatusBadge({ status }: { status: DocItemStatus }) {
  const cfg = {
    pending: { label: "Pendiente", cls: "bg-zinc-500/10 text-zinc-400" },
    submitted: { label: "Presentado", cls: "bg-blue-500/10 text-blue-400" },
    approved: { label: "Aprobado", cls: "bg-emerald-500/10 text-emerald-400" },
    observed: { label: "Observado", cls: "bg-orange-500/10 text-orange-400" },
  }[status];
  return (
    <span
      className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", cfg.cls)}
    >
      {cfg.label}
    </span>
  );
}

function MuniBadge({ status, graceUntil }: { status: MunicipalExpressStatus, graceUntil?: any }) {
  const isWithinGrace = graceUntil && (graceUntil.toDate ? graceUntil.toDate() : new Date(graceUntil)) > new Date();

  const map: Partial<
    Record<MunicipalExpressStatus, { label: string; cls: string }>
  > = {
    pending_municipal_review: {
      label: "Pendiente de revisión",
      cls: "bg-amber-500/10 text-amber-400",
    },
    municipal_observed: {
      label: isWithinGrace ? "Observado (En Gracia)" : "Observado (Vencido)",
      cls: isWithinGrace ? "bg-indigo-500/10 text-indigo-400" : "bg-orange-500/10 text-orange-400",
    },
    municipal_approved: {
      label: "Aprobado — en proceso",
      cls: "bg-blue-500/10 text-blue-400",
    },
    active: {
      label: "✓ Habilitado",
      cls: "bg-emerald-500/10 text-emerald-400",
    },
    renewal_under_review: {
      label: "Renovación pendiente",
      cls: "bg-blue-500/10 text-blue-400",
    },
    suspended_expired_license: {
      label: "Suspendido — Lic. vencida",
      cls: "bg-red-500/10 text-red-400",
    },
    suspended_expired_itv: {
      label: "Suspendido — ITV vencida",
      cls: "bg-red-500/10 text-red-400",
    },
    suspended_expired_insurance: {
      label: "Suspendido — Seg. vencido",
      cls: "bg-red-500/10 text-red-400",
    },
    suspended_unpaid_canon: {
      label: "Suspendido — Canon impago",
      cls: "bg-red-500/10 text-red-400",
    },
    suspended_by_municipality: {
      label: "Suspendido por municipalidad",
      cls: "bg-red-500/10 text-red-400",
    },
    rejected_by_municipality: {
      label: "Rechazado",
      cls: "bg-zinc-500/10 text-zinc-400",
    },
  };
  const cfg = map[status] ?? {
    label: status,
    cls: "bg-zinc-500/10 text-zinc-400",
  };
  return (
    <span className={cn("text-xs font-bold px-3 py-1 rounded-full", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalDriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { profile, user } = useUser();
  const { toast } = useToast();
  const driverId = params.id as string;

  const [mp, setMp] = useState<MunicipalProfile | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [fleetDrivers, setFleetDrivers] = useState<{ id: string; email: string; name?: string; status?: string }[]>([]);
  const [docSubmissions, setDocSubmissions] = useState<Record<string, { storageUrl: string; uploadedAt: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cityConfig, setCityConfig] = useState<any>(null);

  const [legalDoc, setLegalDoc] = useState<any>(null);
  const [loadingLegal, setLoadingLegal] = useState(false);

  // Inline edit states
  const [licDate, setLicDate] = useState("");
  const [insDate, setInsDate] = useState("");
  const [bgDate, setBgDate] = useState("");
  const [itvDate, setItvDate] = useState("");
  const [canDate, setCanDate] = useState("");
  const [obsText, setObsText] = useState("");

  const { cityKey: agentCityKey, isOperator, isMuniAdmin } = useMunicipalContext();

  // Taxi stand assignment states
  const [availableStands, setAvailableStands] = useState<{ id: string; name: string }[]>([]);
  const [selectedStandId, setSelectedStandId] = useState("");

  const targetCityKey = mp?.cityKey || userData?.cityKey || userData?.operatingAreaId || '';

  // Fetch city config
  useEffect(() => {
    if (!firestore || !targetCityKey) return;
    const cityRef = doc(firestore, 'cities', targetCityKey);
    const unsub = onSnapshot(cityRef, snap => {
        if (snap.exists()) {
            setCityConfig(snap.data().config || {});
        }
    });
    return () => unsub();
  }, [firestore, targetCityKey]);

  // Fetch available stands for the driver's cityKey
  useEffect(() => {
    if (!firestore || !targetCityKey) return;
    const fetchStands = async () => {
      try {
        const standsSnap = await getDocs(
          query(
            collection(firestore, 'taxi_stands'),
            where('cityKey', '==', targetCityKey),
            where('status', '==', 'active')
          )
        );
        const list: { id: string; name: string }[] = [];
        standsSnap.forEach(docSnap => {
          list.push({ id: docSnap.id, name: docSnap.data().name });
        });
        setAvailableStands(list);
      } catch (e) {
        console.error("Error fetching available stands:", e);
      }
    };
    fetchStands();
  }, [firestore, targetCityKey]);

  // Synchronize initial stand selection state
  useEffect(() => {
    if (userData?.stationId) {
      setSelectedStandId(userData.stationId);
    } else if (mp?.stationId) {
      setSelectedStandId(mp.stationId);
    } else {
      setSelectedStandId("");
    }
  }, [userData, mp]);

  useEffect(() => {
    if (!firestore || !driverId || !userData?.legal?.driverTermsAccepted || !userData?.legal?.driverTermsVersion) return;
    
    setLoadingLegal(true);
    const fetchLegal = async () => {
        try {
            const docId = `${driverId}_driver_terms_${userData.legal?.driverTermsVersion}`;
            const ref = doc(firestore, 'legal_acceptances', docId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                setLegalDoc(snap.data());
            }
        } catch (e) {
            console.error("Error fetching legal contract:", e);
        } finally {
            setLoadingLegal(false);
        }
    };
    fetchLegal();
  }, [firestore, driverId, userData?.legal?.driverTermsAccepted, userData?.legal?.driverTermsVersion]);

  useEffect(() => {
    if (!firestore || !driverId) return;

    const resolvedCityKey = agentCityKey;

    console.log("[MUNI_DETAIL_CONTEXT]", {
      municipalAdminUid: user?.uid,
      role: profile?.role,
      city: profile?.city,
      cityKey: profile?.cityKey,
      resolvedCityKey,
      targetDriverId: driverId,
    });

    const path = `municipal_profiles/${driverId}`;
    console.log("[MUNI_DETAIL_READ_ATTEMPT]", {
      path,
      targetDriverId: driverId,
    });

    const ref = doc(firestore, "municipal_profiles", driverId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MunicipalProfile;
          setMp(data);
          setObsText(data.municipalObservation ?? "");
        }
      },
      (err) => {
        console.error("[MUNI_DETAIL_FORBIDDEN_MP]", err);
      },
    );

    const userRef = doc(firestore, "users", driverId);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setUserData(snap.data() as UserProfile);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[MUNI_DETAIL_FORBIDDEN_USER]", err);
        setLoading(false);
      },
    );

    return () => {
      unsub();
      unsubUser();
    };
  }, [firestore, driverId, user, profile, agentCityKey]);

  useEffect(() => {
    if (!firestore || !driverId) return;
    const fetchSubmissions = async () => {
      try {
        const q = query(
          collection(firestore, 'municipal_doc_submissions'),
          where('driverId', '==', driverId)
        );
        const snap = await getDocs(q);
        const latestDocs: Record<string, any> = {};
        
        snap.docs.forEach(doc => {
          const data = doc.data();
          const currentLatest = latestDocs[data.docType];
          if (!currentLatest || (data.uploadedAt?.toMillis() > currentLatest.uploadedAt?.toMillis())) {
            latestDocs[data.docType] = data;
          }
        });

        const mapped: Record<string, { storageUrl: string; uploadedAt: string }> = {};
        for (const [docType, data] of Object.entries(latestDocs)) {
          if (data.storageUrl) {
            mapped[docType] = {
              storageUrl: data.storageUrl,
              uploadedAt: data.uploadedAt?.toDate()?.toISOString() || ""
            };
          }
        }
        setDocSubmissions(mapped);
      } catch (err) {
        console.error("Error fetching doc submissions:", err);
      }
    };
    fetchSubmissions();
  }, [firestore, driverId]);

  useEffect(() => {
    if (!firestore || !userData) return;
    const isOwner = userData.isVehicleOwner || (userData.authorizedDriverIds && userData.authorizedDriverIds.length > 0);
    if (!isOwner) return;

    const fetchFleetDrivers = async () => {
      try {
        const q = query(collection(firestore, 'users'), where('vehicleOwnerId', '==', userData.uid));
        const snap = await getDocs(q);
        const drivers = snap.docs.map(doc => ({
          id: doc.id,
          email: doc.data().email,
          name: doc.data().name,
          status: doc.data().municipalStatus
        }));
        setFleetDrivers(drivers);
      } catch (err) {
        console.error("[MUNI_DETAIL_FLEET_DRIVERS]", err);
      }
    };
    fetchFleetDrivers();
  }, [firestore, userData]);

  // Security: only same city
  if (targetCityKey && agentCityKey && targetCityKey !== agentCityKey) {
    return (
      <div className="py-20 text-center space-y-3">
        <VamoIcon name="ban" className="h-10 w-10 mx-auto text-red-500" />
        <p className="text-zinc-400 font-bold">
          Acceso denegado — conductor pertenece a otra municipalidad.
        </p>
        <Link href="/municipal/traffic">
          <button className="text-indigo-400 text-sm">← Volver</button>
        </Link>
      </div>
    );
  }

  const handleInitializeFile = async () => {
    if (!userData || !agentCityKey) return;
    setBusy(true);
    try {
      const muniCode = `MUNI-${driverId.slice(0, 6).toUpperCase()}`;
      await callBackend("initializeMunicipalProfileV1", {
        driverId,
        muniCode,
        cityKey: agentCityKey,
        cityName: profile?.city || "",
      });
      toast({ title: "Legajo Municipal Inicializado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  // ── Backend Function Callers ───────────────────────────────────────────────
  const callBackend = async (name: string, data: any) => {
    const fns = getFunctions(undefined, "us-central1");
    const callable = httpsCallable(fns, name);
    return callable(data);
  };

  // ── ACCIONES ──────────────────────────────────────────────────────────────

  const handleChecklistItem = async (
    key: MunicipalChecklistKey,
    newStatus: DocItemStatus,
    obs?: string,
    expiryDate?: string,
  ) => {
    if (!mp) return;
    setBusy(true);
    try {
      await callBackend("updateMunicipalChecklistItemV1", {
        driverId,
        key,
        status: newStatus,
        observation: obs,
        expiryDate,
      });

      toast({
        title: `${CHECKLIST_LABELS[key]} — ${newStatus === "approved" ? "Aprobado" : "Observado"}`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleCanon = async (paid: boolean, expiryDate?: string) => {
    setBusy(true);
    try {
      await callBackend("updateMunicipalCanonV1", {
        driverId,
        paid,
        expiryDate,
      });

      toast({
        title: paid
          ? "Canon marcado como pagado"
          : "Canon marcado como vencido",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleSetExpiry = async (
    field:
      | "licenseExpiry"
      | "insuranceExpiry"
      | "backgroundCheckExpiry"
      | "canonExpiry",
    dateStr: string,
    action: MunicipalAuditAction,
  ) => {
    if (!dateStr) return;
    setBusy(true);
    try {
      await callBackend("updateMunicipalExpirationsV1", {
        driverId,
        field,
        dateStr,
        auditAction: action,
      });
      toast({ title: "Vencimiento guardado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleObservation = async () => {
    setBusy(true);
    try {
      await callBackend("updateMunicipalStatusV1", {
        driverId,
        status: "municipal_observed",
        observation: obsText,
      });
      toast({ title: "Observación guardada" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const approveDriver = httpsCallable(functions, 'approveDriverV1');
      
      
      await approveDriver({ driverId });

      // Background sync to public profile
      if (firestore) {
          syncPublicDriverProfile(firestore, driverId).catch(console.error);
      }

      toast({
        title: "✅ Conductor habilitado",
        description: "El conductor ya puede operar. Sincronización atómica completada.",
      });
    } catch (e: any) {
      console.error("[MUNICIPAL_APPROVAL_FRONTEND_ERROR]", e);
      toast({ 
        variant: "destructive", 
        title: "Error de habilitación", 
        description: e.message || "No se pudo habilitar al conductor. Verificá los requisitos." 
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async (reason: MunicipalExpressStatus) => {
    setBusy(true);
    try {
      await callBackend("updateMunicipalStatusV1", {
        driverId,
        status: reason,
      });
      toast({ title: "Conductor suspendido", description: reason });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (
      !confirm(
        "¿Rechazar definitivamente al conductor? Esta acción requiere acción manual para revertirse.",
      )
    )
      return;
    setBusy(true);
    try {
      await callBackend("updateMunicipalStatusV1", {
        driverId,
        status: "rejected_by_municipality",
      });
      toast({ title: "Conductor rechazado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleAssignStand = async (standIdToAssign: string) => {
    if (!firestore || !driverId) return;
    setBusy(true);

    const finalStandId = standIdToAssign && standIdToAssign !== "none" ? standIdToAssign : null;
    const standName = finalStandId
      ? (availableStands.find(s => s.id === finalStandId)?.name || "Parada")
      : null;

    try {
      // 1. Update/Create drivers collection (always save here)
      const driverRef = doc(firestore, 'drivers', driverId);
      await setDoc(driverRef, {
        stationId: finalStandId,
        stationName: standName,
        stationAssignedAt: finalStandId ? new Date() : null,
        stationAssignedBy: finalStandId ? (user?.email || 'admin') : null
      }, { merge: true });

      // 2. Update users collection safely if it exists
      try {
        const userRef = doc(firestore, 'users', driverId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await setDoc(userRef, {
            stationId: finalStandId,
            stationName: standName
          }, { merge: true });
        } else {
          console.warn("[STATION_ASSIGN] users document not found, skipping users sync for", driverId);
        }
      } catch (err) {
        console.warn("[STATION_ASSIGN] Error syncing with users collection:", err);
      }

      // 3. Update municipal_profiles safely
      if (mp) {
        const mpRef = doc(firestore, 'municipal_profiles', driverId);
        await setDoc(mpRef, {
          stationId: finalStandId,
          stationName: standName,
          stationAssignedAt: finalStandId ? new Date() : null,
          stationAssignedBy: finalStandId ? (user?.email || 'admin') : null
        }, { merge: true });
      }

      setSelectedStandId(standIdToAssign);
      toast({
        title: 'Parada asignada',
        description: finalStandId ? `Asignado correctamente a "${standName}"` : 'Desvinculado de la parada.'
      });
    } catch (e: any) {
      console.error("Error assigning driver to stand:", e);
      toast({
        variant: 'destructive',
        title: 'Error de asignación',
        description: 'Ocurrió un error al vincular el conductor a la parada.'
      });
    } finally {
      setBusy(false);
    }
  };

  const isFleetDriver = userData?.driverSubtype === 'fleet_driver' || mp?.driverSubtype === 'fleet_driver';
  const applicableChecklistKeys = isFleetDriver 
    ? ['dniFront', 'dniBack', 'driverLicense', 'criminalRecord'] as MunicipalChecklistKey[]
    : CHECKLIST_KEYS.filter(k => {
        if (!cityConfig || !cityConfig.municipalRequirements) return true;
        return cityConfig.municipalRequirements[k] !== false;
      });

  const checklistOk = mp
    ? applicableChecklistKeys.every((k) => mp.checklist?.[k]?.status === "approved")
    : false;
  const canonOk =
    mp?.canonStatus === "paid" &&
    !!mp?.canonExpiry &&
    !isExpired(mp.canonExpiry);
  const licenseOk = !!mp?.licenseExpiry && !isExpired(mp.licenseExpiry);
  const insuranceOk = !!mp?.insuranceExpiry && !isExpired(mp.insuranceExpiry);
  const itvOk = !!mp?.itvExpiry && !isExpired(mp.itvExpiry);
  const canEnable =
    checklistOk &&
    (isFleetDriver || (canonOk && insuranceOk && itvOk)) &&
    licenseOk &&
    mp?.municipalStatus !== "active" &&
    mp?.municipalStatus !== "rejected_by_municipality";

  if (loading)
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    );

  if (!mp && !userData)
    return (
      <div className="py-20 text-center text-zinc-500">
        Conductor no encontrado.
        <Link href="/municipal/traffic">
          <button className="block mx-auto mt-4 text-indigo-400 text-sm">
            ← Volver
          </button>
        </Link>
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* ── BACK ─────────────────────────────────────────────────────── */}
      <Link href="/municipal/traffic">
        <button className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <VamoIcon name="arrow-left" className="h-3.5 w-3.5" /> Volver al
          Control de Tránsito
        </button>
      </Link>

      {/* ── HEADER CONDUCTOR ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">
              {mp?.driverName || userData?.name || "—"}
            </h1>
            <p className="text-zinc-500 text-sm">
              {mp?.driverPhone || userData?.phone} ·{" "}
              {mp?.driverEmail || userData?.email || "—"}
            </p>
          </div>
          {mp ? (
            <div className="flex flex-col items-end gap-1.5">
              <MuniBadge 
                status={mp.municipalStatus} 
                graceUntil={mp.observationGraceUntil || userData?.observationGraceUntil}
              />
              {userData?.trafficSuspended && (
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1">
                  Bloqueado operativamente por Tránsito
                </span>
              )}
              {userData?.adminSuspended && (
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1">
                  Bloqueado por Administración VamO
                </span>
              )}
              {userData?.municipalSuspended && (
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1">
                  Suspendido por Municipalidad
                </span>
              )}
              {mp.observationGraceUntil && (
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-tight",
                  isExpired(mp.observationGraceUntil) ? "text-red-400" : "text-indigo-400/70"
                )}>
                  Plazo: {formatDate(mp.observationGraceUntil)}
                </p>
              )}
            </div>
          ) : (
            <Badge
              variant="outline"
              className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 rounded-full font-bold text-[10px] uppercase tracking-widest px-3 py-1"
            >
              Sin Legajo Municipal
            </Badge>
          )}
        </div>
        {mp ? (
          <div className="flex gap-4 flex-wrap text-xs">
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                Código municipal
              </p>
              <p className="font-mono text-white font-bold text-lg">
                {mp.municipalCode}
              </p>
            </div>
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                Ciudad
              </p>
              <p className="text-white font-bold">{mp.city}</p>
            </div>
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                Alta
              </p>
              <p className="text-white">{formatDate(mp.createdAt)}</p>
            </div>
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                Tipo
              </p>
              <p className={cn(
                "font-bold uppercase tracking-tighter",
                userData?.driverSubtype === 'express' ? "text-amber-400" : "text-blue-400"
              )}>
                {userData?.driverSubtype === 'express' ? 'Express' : 'Profesional'}
              </p>
            </div>
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                Tarifa Dinámica
              </p>
              <p className={cn(
                "font-bold uppercase tracking-tighter",
                (userData?.driverSubtype === 'express' || userData?.driverPreferences?.acceptsDiscountedRides) ? "text-emerald-400" : "text-zinc-500"
              )}>
                {(userData?.driverSubtype === 'express' || userData?.driverPreferences?.acceptsDiscountedRides) ? '✓ Acepta' : '✕ No Acepta'}
              </p>
            </div>
            {mp.enabledAt && (
              <div>
                <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                  Habilitado
                </p>
                <p className="text-emerald-400">{formatDate(mp.enabledAt)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-2">
            <Button
              onClick={handleInitializeFile}
              disabled={busy}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl"
            >
              <VamoIcon name="plus" className="w-4 h-4 mr-2" />
              Inicializar Legajo Municipal
            </Button>
          </div>
        )}
      </div>

      {mp && (
        <div className="space-y-6">
          {/* ── PERFIL DE RIESGO (VamO PRO) ──────────────────────────────── */}
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-indigo-500/10 flex justify-between items-center">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-400">
                Perfil de Riesgo (PRO)
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-zinc-500">Score:</span>
                <span className={cn("text-sm font-black", 
                  (userData?.driverRiskScore || 0) > 85 ? "text-red-500" :
                  (userData?.driverRiskScore || 0) > 60 ? "text-orange-500" :
                  (userData?.driverRiskScore || 0) > 30 ? "text-amber-500" : "text-emerald-500"
                )}>
                  {userData?.driverRiskScore || 0}/100
                </span>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {userData?.driverRiskLevel && (
                   <Badge variant="outline" className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1",
                      userData.driverRiskLevel === 'blocked' ? "border-red-500/50 text-red-500 bg-red-500/10" :
                      userData.driverRiskLevel === 'high' ? "border-orange-500/50 text-orange-500 bg-orange-500/10" :
                      userData.driverRiskLevel === 'medium' ? "border-amber-500/50 text-amber-500 bg-amber-500/10" :
                      "border-emerald-500/50 text-emerald-500 bg-emerald-500/10"
                   )}>
                      {userData.driverRiskLevel}
                   </Badge>
                )}
                {userData?.riskReasons?.map((reason: string, i: number) => (
                  <Badge key={i} variant="secondary" className="bg-white/5 text-zinc-400 border-none text-[9px] uppercase font-bold">
                    {reason}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 italic">Este score se calcula automáticamente basado en factores financieros, operativos y de seguridad.</p>
            </div>
          </div>
          {/* ── INSPECCIÓN DE VEHÍCULO ───────────────────────────────────── */}
          {isFleetDriver ? (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden p-5 text-center">
              <VamoIcon name="car" className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
              <p className="text-sm font-bold text-zinc-400">La documentación del vehículo corresponde al titular y no al chofer.</p>
              <p className="text-xs text-zinc-500 mt-1">Revisar en el perfil del titular.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                  Inspección Visual de Vehículo
                </p>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Frente', url: userData?.vehicleFrontPhotoURL || mp?.vehiclePhotos?.front },
                  { label: 'Trasera', url: (userData as any)?.vehicleBackPhotoURL || mp?.vehiclePhotos?.back },
                  { label: 'Interior', url: (userData as any)?.vehicleInteriorPhotoURL || mp?.vehiclePhotos?.interior }
                ].map((photo, i) => (
                  <div key={i} className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{photo.label}</p>
                    {photo.url ? (
                      <div className="relative group aspect-video rounded-xl overflow-hidden border border-white/5 bg-black">
                        <img src={photo.url} alt={photo.label} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        <a 
                          href={photo.url} target="_blank" rel="noreferrer"
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <VamoIcon name="maximize" className="w-6 h-6 text-white" />
                        </a>
                      </div>
                    ) : (
                      <div className="aspect-video rounded-xl border border-dashed border-white/5 bg-white/[0.01] flex items-center justify-center">
                        <p className="text-[10px] text-zinc-700 font-bold uppercase">No disponible</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ESTRUCTURA DE LA CUENTA (TITULAR/CHOFER) ─────────────────── */}
          <LinkedDriverPanel userData={userData} mp={mp} fleetDrivers={fleetDrivers} />

          {/* ── PARADA DIGITAL ASIGNADA ───────────────────────────────────── */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-xl">
            <div className="px-5 py-4 border-b border-white/5 bg-indigo-500/[0.02] flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-indigo-400">
                  Parada Digital Asignada
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Vincular a este conductor con una parada oficial</p>
              </div>
              <VamoIcon name="map-pin" className="h-5 w-5 text-indigo-400 animate-pulse" />
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Seleccionar Parada</label>
                  <select
                    value={selectedStandId || "none"}
                    onChange={(e) => handleAssignStand(e.target.value)}
                    disabled={!isMuniAdmin || busy}
                    className="w-full h-11 bg-zinc-900 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50"
                  >
                    <option value="none">Sin parada asignada</option>
                    {availableStands.map(stand => (
                      <option key={stand.id} value={stand.id}>{stand.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {!isMuniAdmin && (
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-tight">
                  * Solo los administradores municipales y globales tienen permisos para modificar la parada asignada.
                </p>
              )}
            </div>
          </div>

          {/* ── NOTAS MUNICIPALES ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Notas Municipales (Uso Interno)
              </p>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={obsText}
                onChange={(e) => setObsText(e.target.value)}
                placeholder="Escribí aquí observaciones internas, historial de incidentes o notas de inspección..."
                className="w-full h-32 rounded-xl bg-white/[0.03] border border-white/5 p-4 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
              />
              <div className="flex justify-end">
                <Button 
                  onClick={handleObservation}
                  disabled={busy}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl h-10 px-6"
                >
                  Guardar Notas
                </Button>
              </div>
            </div>
          </div>
          {/* ── CHECKLIST DOCUMENTAL ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Checklist Documental
              </p>
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  checklistOk
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-zinc-500 bg-zinc-700/30",
                )}
              >
                {
                  applicableChecklistKeys.filter(
                    (k) => mp.checklist?.[k]?.status === "approved",
                  ).length
                }
                /{applicableChecklistKeys.length} aprobados
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {applicableChecklistKeys.map((key) => {
                const item = mp.checklist?.[key];
                const status = (item?.status ?? "pending") as DocItemStatus;
                const fallbackUrl = docSubmissions[key]?.storageUrl;
                const finalStorageUrl = item?.storageUrl || fallbackUrl;
                const submittedAt = item?.submittedAt?.toDate?.()?.toISOString() || docSubmissions[key]?.uploadedAt;

                return (
                  <div key={key} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <VamoIcon
                            name={
                              status === "approved"
                                ? "check-circle"
                                : status === "observed"
                                  ? "alert-triangle"
                                  : status === "submitted"
                                    ? "clock"
                                    : "file"
                            }
                            className={cn(
                              "h-4 w-4",
                              status === "approved"
                                ? "text-emerald-400"
                                : status === "observed"
                                  ? "text-orange-400"
                                  : "text-zinc-500",
                            )}
                          />
                          <span className="text-sm font-medium text-zinc-300">
                            {CHECKLIST_LABELS[key]}
                          </span>
                        </div>

                        {/* Current/Vigente */}
                        {item?.currentStorageUrl && (
                          <div className="ml-6 flex flex-col gap-0.5">
                            <a
                              href={item.currentStorageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md hover:bg-emerald-500/20 transition-colors w-fit flex items-center gap-1"
                            >
                              <VamoIcon name="external-link" className="w-3 h-3" />
                              Ver vigente
                            </a>
                            {item.expiresAt && (
                              <span className="text-[10px] text-zinc-400 italic">
                                Vence: {formatDate(item.expiresAt)}
                              </span>
                            )}
                            {item.approvedAt && (
                              <span className="text-[10px] text-zinc-500 italic">
                                Aprobado: {formatDate(item.approvedAt)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Fallback old storageUrl if currentStorageUrl not populated yet */}
                        {item?.storageUrl && !item?.currentStorageUrl && !item?.pendingStorageUrl && (
                          <div className="ml-6 flex flex-col gap-0.5">
                            <a
                              href={item.storageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md hover:bg-indigo-500/20 transition-colors w-fit flex items-center gap-1"
                            >
                              <VamoIcon name="external-link" className="w-3 h-3" />
                              Ver documento
                            </a>
                            {submittedAt && (
                              <span className="text-[10px] text-zinc-500 italic">
                                Presentado: {new Date(submittedAt).toLocaleDateString("es-AR")}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Pending/Nueva presentación */}
                        {(item?.pendingStorageUrl || fallbackUrl) && (!item?.storageUrl || item?.pendingStorageUrl) && (
                          <div className="ml-6 mt-1 flex flex-col gap-0.5">
                            <a
                              href={item?.pendingStorageUrl || fallbackUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md hover:bg-blue-500/20 transition-colors w-fit flex items-center gap-1"
                            >
                              <VamoIcon name="external-link" className="w-3 h-3" />
                              Ver nueva presentación
                            </a>
                            <span className="text-[10px] text-zinc-500 italic">
                              Pendiente de revisión
                            </span>
                          </div>
                        )}

                        {!finalStorageUrl && !item?.currentStorageUrl && !item?.pendingStorageUrl && (
                          <p className="text-[10px] text-zinc-500 ml-6 italic">
                            Sin archivo presentado
                          </p>
                        )}
                      </div>
                      <DocStatusBadge status={status} />
                    </div>
                    {item?.observation && (
                      <p className="text-xs text-orange-400/80 bg-orange-500/5 rounded-lg px-3 py-1.5 italic">
                        Observación: {item.observation}
                      </p>
                    )}
                    {/* Acciones */}
                    {isOperator && (
                      <div className="flex gap-2 flex-wrap items-center mt-2">
                        {status !== "approved" && !finalStorageUrl && !item?.currentStorageUrl && !item?.pendingStorageUrl && (
                          <span className="text-[10px] text-orange-400/80 italic mr-2">⚠️ Requiere ver archivo para aprobar</span>
                        )}
                        
                        {/* Aprobar boton disponible si no está aprobado O si hay uno pendiente */}
                        {(status !== "approved" || item?.pendingStorageUrl) && (
                          <ApproveItemButton
                            keyId={key}
                            disabled={busy || (!finalStorageUrl && !item?.pendingStorageUrl)}
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

                        {/* Observar boton si no está aprobado O si hay pendiente */}
                        {(status !== "approved" || item?.pendingStorageUrl) && (
                          <ObserveItemButton
                            disabled={busy}
                            onObserve={(obs) =>
                              handleChecklistItem(key, "observed", obs)
                            }
                          />
                        )}

                        {/* Revertir si está aprobado y NO hay pendiente */}
                        {status === "approved" && !item?.pendingStorageUrl && (
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
                );
              })}
            </div>
          </div>

          {/* ── VENCIMIENTOS MANUALES ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Vencimientos (Edición Excepcional)
              </p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Utilizá esta sección solo para corregir fechas manualmente. El flujo regular solicita el vencimiento al aprobar cada documento arriba.
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {/* Licencia */}
              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-300">
                    Licencia de conducir
                  </p>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      mp.licenseExpiry
                        ? isExpired(mp.licenseExpiry)
                          ? "text-red-400"
                          : "text-emerald-400"
                        : "text-zinc-600",
                    )}
                  >
                    {mp.licenseExpiry
                      ? formatDate(mp.licenseExpiry) +
                        (isExpired(mp.licenseExpiry) ? " — VENCIDA" : "")
                      : "Sin cargar"}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={licDate}
                    onChange={(e) => setLicDate(e.target.value)}
                    className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !licDate}
                    onClick={() =>
                      handleSetExpiry(
                        "licenseExpiry",
                        licDate,
                        "license_expiry_set",
                      )
                    }
                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
                  >
                    Guardar
                  </Button>
                </div>
              </div>
              {/* Seguro */}
              {!isFleetDriver && (
                <div className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-300">
                      Seguro del vehículo
                    </p>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        mp.insuranceExpiry
                          ? isExpired(mp.insuranceExpiry)
                            ? "text-red-400"
                            : "text-emerald-400"
                          : "text-zinc-600",
                      )}
                    >
                      {mp.insuranceExpiry
                        ? formatDate(mp.insuranceExpiry) +
                          (isExpired(mp.insuranceExpiry) ? " — VENCIDO" : "")
                        : "Sin cargar"}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="date"
                      value={insDate}
                      onChange={(e) => setInsDate(e.target.value)}
                      className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !insDate}
                      onClick={() =>
                        handleSetExpiry(
                          "insuranceExpiry",
                          insDate,
                          "insurance_expiry_set",
                        )
                      }
                      className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              )}
              {/* Antecedentes */}
              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-300">
                    Antecedentes penales
                  </p>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      mp.backgroundCheckExpiry
                        ? isExpired(mp.backgroundCheckExpiry)
                          ? "text-red-400"
                          : "text-emerald-400"
                        : "text-zinc-600",
                    )}
                  >
                    {mp.backgroundCheckExpiry
                      ? formatDate(mp.backgroundCheckExpiry) +
                        (isExpired(mp.backgroundCheckExpiry)
                          ? " — VENCIDO"
                          : "")
                      : "Sin cargar"}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={bgDate}
                    onChange={(e) => setBgDate(e.target.value)}
                    className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !bgDate}
                    onClick={() =>
                      handleSetExpiry(
                        "backgroundCheckExpiry",
                        bgDate,
                        "background_check_expiry_set",
                      )
                    }
                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
                  >
                    Guardar
                  </Button>
                </div>
              </div>
              {/* ITV */}
              {!isFleetDriver && (
                <div className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-300">
                      ITV / VTV del vehículo
                    </p>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        mp.itvExpiry
                          ? isExpired(mp.itvExpiry)
                            ? "text-red-400"
                            : "text-emerald-400"
                          : "text-zinc-600",
                      )}
                    >
                      {mp.itvExpiry
                        ? formatDate(mp.itvExpiry) +
                          (isExpired(mp.itvExpiry) ? " — VENCIDO" : "")
                        : "Sin cargar"}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="date"
                      value={itvDate}
                      onChange={(e) => setItvDate(e.target.value)}
                      className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !itvDate}
                      onClick={() =>
                        handleSetExpiry(
                          "itvExpiry" as any,
                          itvDate,
                          "itv_expiry_set" as any,
                        )
                      }
                      className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── CANON ────────────────────────────────────────────────────── */}
          
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-400">
                Contrato Legal del Conductor
              </p>
              <div className="space-y-4 mt-2">
                    {userData?.legal?.driverTermsAccepted ? (
                        <>
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-xs font-bold text-zinc-300">Estado Legal</span>
                                <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/5 text-[9px]">ACEPTADO</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-zinc-500 block text-[9px] uppercase font-bold">Versión</span>{userData.legal.driverTermsVersion}</div>
                                <div><span className="text-zinc-500 block text-[9px] uppercase font-bold">Fecha</span>{userData.legal.driverTermsAcceptedAt ? new Date(userData.legal.driverTermsAcceptedAt.toMillis ? userData.legal.driverTermsAcceptedAt.toMillis() : userData.legal.driverTermsAcceptedAt).toLocaleString('es-AR') : 'N/A'}</div>
                            </div>
                            
                            {loadingLegal ? (
                                <p className="text-xs text-zinc-500 animate-pulse">Cargando firma digital...</p>
                            ) : legalDoc ? (
                                <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/5 space-y-2 text-[10px]">
                                    <p className="font-bold text-green-400 uppercase flex items-center gap-1 mb-2">
                                        <CheckCircle2 className="h-3 w-3" /> Contrato registrado (Trazabilidad)
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><span className="text-zinc-500 font-bold uppercase block">Firma (Aclaración)</span><span className="text-zinc-300 font-medium">{legalDoc.fullName}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">DNI</span><span className="text-zinc-300 font-medium">{legalDoc.dni}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">Ciudad Operativa</span><span className="text-zinc-300 font-medium">{legalDoc.cityKey}</span></div>
                                        <div><span className="text-zinc-500 font-bold uppercase block">Email Asociado</span><span className="text-zinc-300 font-medium">{legalDoc.email}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">Hash (SHA-256)</span><span className="text-zinc-300 font-mono text-[8px] break-all">{legalDoc.hash}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">IP de Firma</span><span className="text-zinc-300 font-mono text-[9px]">{legalDoc.ip || 'No registrada'}</span></div>
                                        <div className="col-span-2"><span className="text-zinc-500 font-bold uppercase block">Dispositivo</span><span className="text-zinc-300 text-[9px] truncate block">{legalDoc.userAgent || 'No registrado'}</span></div>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500 flex gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold uppercase">CONTRATO NO ACEPTADO</p>
                                <p className="text-[10px] opacity-80">Este conductor todavía no aceptó el contrato legal obligatorio y no puede operar.</p>
                            </div>
                        </div>
                    )}
              </div>
          </div>

          {!isFleetDriver && (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Canon Municipal
              </p>
              <span
                className={cn(
                  "text-sm font-bold",
                  mp.canonStatus === "paid"
                    ? "text-emerald-400"
                    : mp.canonStatus === "overdue"
                      ? "text-red-400"
                      : "text-amber-400",
                )}
              >
                {mp.canonStatus === "paid"
                  ? "✓ Pagado"
                  : mp.canonStatus === "overdue"
                    ? "✗ Vencido"
                    : "⏳ Pendiente"}
              </span>
            </div>
            <div className="space-y-1">
              {mp.canonPaidAt && (
                <p className="text-xs text-zinc-400">
                  Pagado el:{" "}
                  <span className="text-zinc-200 font-medium">
                    {formatDate(mp.canonPaidAt)}
                  </span>
                </p>
              )}
              {mp.canonExpiry && (
                <p
                  className={cn(
                    "text-xs font-medium",
                    isExpired(mp.canonExpiry)
                      ? "text-red-400"
                      : "text-zinc-400",
                  )}
                >
                  Vence el:{" "}
                  <span
                    className={cn(
                      "font-bold",
                      isExpired(mp.canonExpiry)
                        ? "text-red-400 underline"
                        : "text-zinc-200",
                    )}
                  >
                    {formatDate(mp.canonExpiry)}
                  </span>
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={canDate}
                onChange={(e) => setCanDate(e.target.value)}
                className="h-8 text-xs bg-white/[0.03] border-white/10 text-white w-40"
              />
              <Button
                size="sm"
                disabled={busy || !canDate}
                onClick={() =>
                  handleSetExpiry("canonExpiry", canDate, "canon_expiry_set")
                }
                className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
              >
                Guardar vencimiento
              </Button>
            </div>
            <div className="flex gap-2 pt-2 border-t border-white/5">
              <ApproveItemButton
                label="✓ Marcar pagado"
                disabled={busy || mp.canonStatus === "paid"}
                needsExpiry={true}
                onConfirm={(expiry) => handleCanon(true, expiry)}
                className="h-8 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/20"
              />
              <Button
                size="sm"
                disabled={busy}
                onClick={() => handleCanon(false)}
                className="h-8 text-[10px] font-black uppercase tracking-widest bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20"
              >
              </Button>
            </div>
          </div>
          )}

          {/* ── OBSERVACIÓN ──────────────────────────────────────────────── */}
          {isOperator && (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Observación municipal
              </p>
              <p className="text-[10px] text-zinc-600">
                Este texto es visible para el conductor en su panel.
              </p>
              <textarea
                value={obsText}
                onChange={(e) => setObsText(e.target.value)}
                rows={3}
                placeholder="Indicá aquí qué debe corregir el conductor..."
                className="w-full text-sm text-zinc-300 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 resize-none placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
              <Button
                size="sm"
                disabled={busy}
                onClick={handleObservation}
                className="h-8 text-[10px] font-black uppercase tracking-widest bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/20"
              >
                Guardar observación
              </Button>
            </div>
          )}

          {/* ── ACCIONES PRINCIPALES ─────────────────────────────────────── */}
          {isOperator && (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Acciones municipales
              </p>

              {/* Botón HABILITAR — con regla completa */}
              <div className="space-y-2">
                <Button
                  disabled={busy || !canEnable}
                  onClick={handleEnable}
                  className={cn(
                    "w-full h-12 text-sm font-black uppercase tracking-widest transition-all",
                    canEnable
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  {mp.municipalStatus === "active"
                    ? "✓ Conductor ya habilitado"
                    : "🏛 Habilitar conductor"}
                </Button>
                {!canEnable && mp.municipalStatus !== "active" && (
                  <ul className="text-xs font-medium text-zinc-300 space-y-1 ml-1 mt-3">
                    {!checklistOk && (
                      <li>
                        · Checklist:{" "}
                        {
                          applicableChecklistKeys.filter(
                            (k) => mp.checklist?.[k]?.status !== "approved",
                          ).length
                        }{" "}
                        ítems sin aprobar
                      </li>
                    )}
                    {!isFleetDriver && !canonOk && <li>· Canon municipal no pagado</li>}
                    {!licenseOk && (
                      <li>· Vencimiento de licencia no cargado o vencido</li>
                    )}
                    {!isFleetDriver && !insuranceOk && (
                      <li>· Vencimiento de seguro no cargado o vencido</li>
                    )}
                    {!isFleetDriver && !itvOk && (
                      <li>· Vencimiento de ITV/VTV no cargado o vencido</li>
                    )}
                  </ul>
                )}
              </div>

              {/* Suspend / Reject */}
              {mp.municipalStatus === "active" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => handleSuspend("suspended_by_municipality")}
                    className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                  >
                    Suspender
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={handleReject}
                    className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-400 border border-zinc-600/20"
                  >
                    Rechazar
                  </Button>
                </div>
              )}

              {/* Rechazar desde otros estados */}
              {mp.municipalStatus !== "active" &&
                mp.municipalStatus !== "rejected_by_municipality" && (
                  <button
                    disabled={busy}
                    onClick={handleReject}
                    className="text-xs text-zinc-400 font-medium hover:text-red-400 transition-colors underline pt-2"
                  >
                    Rechazar definitivamente
                  </button>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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

  // Predeterminar +1 mes si es Canon
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

// ─── Inline Observe Dialog ────────────────────────────────────────────────────
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
