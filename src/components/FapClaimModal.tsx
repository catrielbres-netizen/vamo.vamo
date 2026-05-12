'use client';

import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Ride, FapType } from '@/lib/types';
import { Loader2, CheckCircle2, AlertCircle, Image, X, Camera } from 'lucide-react';
import { useUser, useFirebaseApp, useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface FapClaimModalProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
}

export function FapClaimModal({ ride, isOpen, onClose }: FapClaimModalProps) {
  const { user, profile } = useUser();
  const app = useFirebaseApp();
  const [type, setType] = useState<FapType>('other');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCaseId, setSuccessCaseId] = useState<string | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [requestedAmount, setRequestedAmount] = useState<string>('');
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const firestore = useFirestore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen && ride.id) {
        setLoadingRecs(true);
        const q = query(collection(firestore, 'ride_recordings'), where('rideId', '==', ride.id), where('status', '==', 'uploaded'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setRecordings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingRecs(false);
        });
        return () => unsubscribe();
    }
  }, [isOpen, ride.id, firestore]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... no changes in photo upload logic
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ride?.id) {
        setError('Error de integridad: ID de viaje no encontrado.');
        console.error("[FAP_UPLOAD_ERROR] Missing ride.id in modal props");
        return;
    }

    if (!file.type.startsWith('image/')) {
        setError('Por favor, selecciona una imagen válida.');
        return;
    }

    // 5MB Limit
    if (file.size > 5 * 1024 * 1024) {
        setError('La imagen es demasiado pesada (Máximo 5MB).');
        return;
    }

    setIsUploading(true);
    setError(null);
    try {
        const storage = getStorage(app);
        const storageRef = ref(storage, `fap_evidence/${user.uid}/${ride.id}/${Date.now()}_${file.name}`);
        
        console.log(`[FAP_UPLOAD_DEBUG] Attempting upload to: fap_evidence/${user.uid}/${ride.id}/`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        setEvidenceUrls(prev => [...prev, url]);
        
        console.log("[FAP_UPLOAD_SUCCESS] Photo uploaded successfully:", url);
    } catch (err: any) {
        console.error("[FAP_UPLOAD_ERROR] Fatal error during uploadBytes:", err);
        setError(`Error al subir la imagen: ${err.message || 'Error de red'}`);
    } finally {
        setIsUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Por favor, describe lo sucedido.');
      return;
    }

    const isLevel3 = ["accident", "robbery", "medical"].includes(type);
    if (isLevel3 && profile?.identityStatus !== 'approved') {
        setError('La verificación de identidad es obligatoria para este tipo de reporte. Por favor, verifícate en tu perfil.');
        return;
    }

    // Validate requested amount if provided
    const amountNum = Number(requestedAmount);
    if (requestedAmount && (isNaN(amountNum) || amountNum < 0)) {
        setError('Por favor, ingresa un monto válido.');
        return;
    }

    if (amountNum > 150000) {
        setError('El monto máximo de asistencia es de $150.000.');
        return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const functions = getFunctions(undefined, 'us-central1');
      const createClaim = httpsCallable(functions, 'createFapClaimV1');
      
      const result = await createClaim({
        rideId: ride.id,
        type,
        description,
        evidenceUrls,
        requestedAmount: amountNum || 0
      });

      const data = result.data as { success: boolean; caseId: string };
      if (data.success) {
        setSuccessCaseId(data.caseId);
      }
    } catch (err: any) {
      console.error('Error creating FAP claim:', err);
      setError(err.message || 'No se pudo enviar el reporte. Verifica el límite de 24 horas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successCaseId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-emerald-500/30">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Reporte Recibido</DialogTitle>
            <DialogDescription className="text-center pt-2">
              Tu solicitud de asistencia ha sido registrada correctamente bajo el número de caso:
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-zinc-900 border border-emerald-500/20 p-4 rounded-xl text-center my-4">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-wider">
              {successCaseId}
            </span>
          </div>

          <p className="text-xs text-zinc-400 text-center px-4">
            Un administrador revisará la evidencia y se contactará contigo a través de los canales oficiales de VamO.
          </p>

          <DialogFooter className="mt-6">
            <Button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VamoIcon name="shield-check" className="text-emerald-500" />
            Asistencia VamO (F.A.P.)
          </DialogTitle>
          <DialogDescription>
            Reportá cualquier incidente ocurrido durante tu viaje Express para solicitar asistencia económica.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="type" className="text-zinc-400">Tipo de Incidente</Label>
            <Select value={type} onValueChange={(v) => setType(v as FapType)}>
              <SelectTrigger id="type" className="bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="overcharge">Cobro incorrecto</SelectItem>
                <SelectItem value="behavior">Seguridad / Comportamiento</SelectItem>
                <SelectItem value="behavior">Inconveniente con el conductor</SelectItem>
                <SelectItem value="accident">Accidente / Incidente en viaje</SelectItem>
                <SelectItem value="lost_item">Objeto olvidado</SelectItem>
                <SelectItem value="other">Otro problema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-zinc-400">Monto estimado de asistencia (ARS)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
              <Input 
                id="amount"
                type="number"
                placeholder="0"
                className="bg-zinc-900 border-zinc-800 pl-8"
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-zinc-500 italic mt-1 px-1">
              * El monto máximo por viaje es de $150.000 (Sujeto a aprobación).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-400">Descripción de los hechos</Label>
            <Textarea 
              id="description" 
              placeholder="Describe detalladamente qué sucedió..."
              className="bg-zinc-900 border-zinc-800 min-h-[100px] resize-none pb-8"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-[10px] text-zinc-500 italic mt-1 px-1">
              * El F.A.P. es un beneficio discrecional y limitado. La sola presentación no garantiza el reintegro.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-zinc-400">Evidencia fotográfica (Obligatoria)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSubmitting}
                className="h-8 text-[10px] uppercase font-bold tracking-wider text-emerald-500 hover:text-emerald-400"
              >
                {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Camera className="h-3 w-3 mr-1" />}
                Subir Foto
              </Button>
            </div>
            
            {evidenceUrls.length === 0 && (
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">
                    ⚠️ Adjuntá al menos una foto para enviar el reclamo.
                </p>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              className="hidden" 
              accept="image/*" 
            />

            {evidenceUrls.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {evidenceUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 group">
                    {url.includes('.webm') ? (
                       <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                          <VamoIcon name="video" className="text-zinc-500" />
                       </div>
                    ) : (
                       <img src={url} alt="Evidencia" className="object-cover w-full h-full" />
                    )}
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 bg-black/60 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recordings Section */}
          {recordings.length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              <Label className="text-zinc-400">Grabaciones de Seguridad disponibles</Label>
              <div className="space-y-2">
                {recordings.map(rec => {
                  const isAttached = evidenceUrls.includes(rec.downloadUrl);
                  return (
                    <div key={rec.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2">
                        <VamoIcon name={rec.type === 'audio' ? 'mic' : 'video'} className="h-4 w-4 text-zinc-500" />
                        <div>
                          <p className="text-[10px] font-bold text-white capitalize">{rec.type === 'audio' ? 'Audio' : 'Video'}</p>
                          <p className="text-[9px] text-zinc-500">{new Date(rec.createdAt?.toDate ? rec.createdAt.toDate() : rec.createdAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isAttached ? 'secondary' : 'outline'}
                        className="h-7 text-[9px] font-black uppercase tracking-widest px-3"
                        onClick={() => {
                          if (isAttached) {
                            setEvidenceUrls(prev => prev.filter(u => u !== rec.downloadUrl));
                          } else {
                            setEvidenceUrls(prev => [...prev, rec.downloadUrl]);
                          }
                        }}
                      >
                        {isAttached ? 'Quitar' : 'Adjuntar'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(() => {
            const isLevel3 = ["accident", "robbery", "medical"].includes(type);
            const isUnverified = profile?.identityStatus !== 'approved';
            
            if (isLevel3 && isUnverified) {
              return (
                <Alert className="bg-red-500/10 border-red-500/20 text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-[10px] font-black uppercase tracking-[0.2em]">Acceso Restringido</AlertTitle>
                  <AlertDescription className="text-xs">
                    Para reportar este tipo de incidente, primero debes verificar tu identidad en la sección de <b>Perfil</b>.
                  </AlertDescription>
                </Alert>
              );
            }

            return (
              <Alert className="bg-emerald-500/5 border-emerald-500/20 text-emerald-400">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs font-bold uppercase tracking-wider">Recordatorio</AlertTitle>
                <AlertDescription className="text-xs">
                  Tenés hasta 24 horas después del viaje para realizar este reporte.
                </AlertDescription>
              </Alert>
            );
          })()}

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20 flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || evidenceUrls.length === 0 || (["accident", "robbery", "medical"].includes(type) && profile?.identityStatus !== 'approved')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
