'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { Checkbox } from '@/components/ui/checkbox';

interface BroadcastDialogProps {
  targetRole: 'driver' | 'passenger';
  cityKey: string;
}

export function BroadcastDialog({ targetRole, cityKey }: BroadcastDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<{ email: boolean; push: boolean }>({
    email: true,
    push: true,
  });
  const [isSending, setIsSending] = useState(false);
  
  const { functions } = useFirebase();
  const { toast } = useToast();

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      return toast({
        title: 'Campos requeridos',
        description: 'Por favor ingresa un título y un mensaje.',
        variant: 'destructive',
      });
    }

    if (!channels.email && !channels.push) {
      return toast({
        title: 'Canal requerido',
        description: 'Selecciona al menos Email o Notificación Push.',
        variant: 'destructive',
      });
    }

    if (!functions) return;

    setIsSending(true);
    try {
      const selectedChannels = [];
      if (channels.email) selectedChannels.push('email');
      if (channels.push) selectedChannels.push('push');

      const broadcastFn = httpsCallable(functions, 'adminBroadcastMessageV1');
      const response = await broadcastFn({
        cityKey,
        targetRole,
        title,
        body,
        channels: selectedChannels,
      });

      const data = response.data as any;
      toast({
        title: '¡Comunicado enviado!',
        description: `Se han encolado ${data.emailsEnqueued} emails y enviado ${data.pushesSent} push.`,
      });
      
      setOpen(false);
      setTitle('');
      setBody('');
    } catch (error: any) {
      toast({
        title: 'Error al enviar comunicado',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-bold uppercase text-[10px] tracking-widest h-9 px-4">
          <VamoIcon name="megaphone" className="w-4 h-4" />
          Enviar Comunicado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">
            Difusión a {targetRole === 'driver' ? 'Conductores' : 'Pasajeros'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Envíe un mensaje masivo a todos los usuarios de este tipo en la ciudad seleccionada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Título / Asunto
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: ¡Fecha de Lanzamiento Confirmada!"
              className="bg-white/5 border-white/10 text-white focus:border-indigo-500"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="body" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Mensaje Principal
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escriba el texto del comunicado aquí..."
              className="min-h-[120px] bg-white/5 border-white/10 text-white focus:border-indigo-500"
            />
          </div>
          
          <div className="flex flex-col gap-3 mt-2 bg-white/5 p-3 rounded-lg border border-white/5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
              Canales de Envío
            </Label>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="push" 
                checked={channels.push} 
                onCheckedChange={(c) => setChannels(prev => ({ ...prev, push: !!c }))}
              />
              <Label htmlFor="push" className="text-sm font-medium cursor-pointer">
                Notificación Push en la App
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="email" 
                checked={channels.email} 
                onCheckedChange={(c) => setChannels(prev => ({ ...prev, email: !!c }))}
              />
              <Label htmlFor="email" className="text-sm font-medium cursor-pointer">
                Correo Electrónico (Email)
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white">
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {isSending ? <VamoIcon name="loader" className="w-4 h-4 animate-spin" /> : 'Confirmar Envío'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
