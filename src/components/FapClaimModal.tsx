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
import { Ride, FapType } from '@/lib/types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface FapClaimModalProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
}

export function FapClaimModal({ ride, isOpen, onClose }: FapClaimModalProps) {
  const [type, setType] = useState<FapType>('other');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCaseId, setSuccessCaseId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Por favor, describe lo sucedido.');
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
        evidenceUrls: [], // TODO: Feature de subida de fotos
        requestedAmount: 0 // Opcional en v1.0
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
                <SelectItem value="accident">Accidente / Choque</SelectItem>
                <SelectItem value="injury">Lesión física</SelectItem>
                <SelectItem value="damage">Daño a pertenencias</SelectItem>
                <SelectItem value="theft">Robo / Hurto</SelectItem>
                <SelectItem value="other">Otro problema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-400">Descripción de los hechos</Label>
            <Textarea 
              id="description" 
              placeholder="Describe detalladamente qué sucedió..."
              className="bg-zinc-900 border-zinc-800 min-h-[100px] resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Alert className="bg-emerald-500/5 border-emerald-500/20 text-emerald-400">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase tracking-wider">Recordatorio</AlertTitle>
            <AlertDescription className="text-xs">
              Tenés hasta 24 horas después del viaje para realizar este reporte.
            </AlertDescription>
          </Alert>

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
            disabled={isSubmitting}
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
