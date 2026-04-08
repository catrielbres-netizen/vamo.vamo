'use client';

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface PanicButtonProps {
  rideId: string;
  role: 'passenger' | 'driver';
  className?: string;
  variant?: 'default' | 'minimal';
}

export const PanicButton: React.FC<PanicButtonProps> = ({ rideId, role, className, variant = 'default' }) => {
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handlePanic = async () => {
    if (!firebaseApp || !rideId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const triggerPanic = httpsCallable(functions, 'triggerPanicAlertV1');
      
      // Get current location if available
      let location = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (err) {
        console.warn('Could not get location for panic alert:', err);
      }

      const payload = { rideId, role, location };
      console.log('🚨 [PANIC_DEBUG] - Enviando alerta al backend:', payload);
      
      await triggerPanic(payload);

      setLastLocation(location);

      toast({
        variant: 'default',
        title: '¡ALERTA ENVIADA!',
        description: 'El centro de control ha sido notificado. Seguí en un lugar seguro.',
        duration: 8000,
      });

      if (role === 'passenger') {
        setShowShareDialog(true);
      }
    } catch (error: any) {
      console.error('🚨 [PANIC_DEBUG] - Error al disparar pánico:', error);
      
      // Attempt to extract meaningful message from Firebase HttpsError
      const errorMessage = error.message || 'Error interno del servidor.';
      const errorCode = error.code || 'unknown';

      toast({
        variant: 'destructive',
        title: 'Error al enviar alerta',
        description: `${errorMessage} (Código: ${errorCode})`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="morphic"
          className={cn(
            variant === 'minimal' 
              ? `bg-red-600 hover:bg-red-700 text-white p-0 ${className}` 
              : `bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-tighter ${className}`,
            "shadow-red-600/20"
          )}
          disabled={isSubmitting}
        >
          <ShieldAlert className={variant === 'minimal' ? "h-5 w-5 animate-pulse" : "mr-2 h-5 w-5 animate-pulse"} />
          {variant !== 'minimal' && "Botón Antipánico"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-[2rem] border-red-500/50 bg-[#1a0000] text-red-50">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-2xl font-black text-red-500 uppercase">
            <AlertTriangle className="h-8 w-8 text-red-600" />
            ¡ATENCIÓN!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-red-200/80 text-base font-bold">
            ¿Confirmás el envío de una ALERTA CRÍTICA? 
            <br /><br />
            Esto notificará inmediatamente al centro de monitoreo de VamO con tu ubicación exacta y datos del viaje.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 sm:space-x-4">
          <AlertDialogCancel className="rounded-2xl h-14 bg-white/10 text-white hover:bg-white/20 border-none font-bold">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handlePanic}
            className="rounded-2xl h-14 bg-red-600 text-white hover:bg-red-700 font-extrabold text-lg transition-all"
            disabled={isSubmitting}
          >
            SÍ, ENVIAR ALERTA
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <SharePanicDialog 
        isOpen={showShareDialog} 
        onClose={() => setShowShareDialog(false)} 
        location={lastLocation} 
    />
    </>
  );
};

function SharePanicDialog({ isOpen, onClose, location }: { isOpen: boolean, onClose: () => void, location: { lat: number, lng: number } | null }) {
    const { toast } = useToast();
    
    const message = `Emergencia VamO. Estoy en un viaje.
Esta es mi ubicación actual:
${location ? `https://maps.google.com/?q=${location.lat},${location.lng}` : '(Ubicación no disponible)'}`;

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Emergencia VamO',
                    text: message,
                });
                onClose();
            } catch (err) {
                console.error('Error sharing:', err);
            }
        } else {
            handleCopy();
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(message);
        toast({ title: "Mensaje copiado", description: "Pegalo en WhatsApp para tus contactos." });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="rounded-[2rem] bg-zinc-950 border-white/10 text-white max-w-[90vw] sm:max-w-[400px]">
                <DialogHeader className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                    </div>
                    <DialogTitle className="text-2xl font-black uppercase">¡Alerta lista!</DialogTitle>
                    <DialogDescription className="text-zinc-400 font-medium">
                        La alerta interna fue enviada. Ahora podés compartir tu ubicación con tus contactos de confianza.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 my-2">
                    <p className="text-xs font-mono text-zinc-500 uppercase font-black mb-2 tracking-widest">Vista previa del mensaje</p>
                    <p className="text-sm whitespace-pre-wrap font-medium">{message}</p>
                </div>

                <div className="grid gap-3 pt-2">
                    <Button 
                        onClick={handleShare}
                        variant="morphic"
                        className="h-14 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black text-lg gap-2 shadow-green-500/20"
                    >
                        <Share2 className="h-5 w-5" />
                        COMPARTIR UBICACIÓN
                    </Button>
                    <Button 
                        variant="ghost"
                        onClick={handleCopy}
                        className="h-12 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/5 font-bold gap-2"
                    >
                        <Copy className="h-4 w-4" />
                        Copiar mensaje solo
                    </Button>
                    <Button 
                        variant="link"
                        onClick={onClose}
                        className="text-zinc-600 hover:text-zinc-400 text-xs uppercase font-black tracking-widest mt-2"
                    >
                        Entendido, cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
