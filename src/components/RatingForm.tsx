// @/components/RatingForm.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';

export interface RatingFormProps {
  participantName: string;
  participantRole: 'conductor' | 'pasajero';
  onSubmit: (feedbackType: 'thumbs_up' | 'thumbs_down', reason?: string, comments?: string) => void;
  isSubmitted: boolean;
  photoURL?: string | null;
  submitButtonText?: string;
  initialFeedbackType?: 'thumbs_up' | 'thumbs_down';
  initialComment?: string;
}

const DRIVER_COMPLAINTS = [
    { value: 'mild', label: 'Llegó tarde / Auto sucio' },
    { value: 'moderate', label: 'Falta de respeto / Cancelación simulada' },
    { value: 'severe', label: 'Manejo temerario / Acoso / Identidad falsa' }
];

const PASSENGER_COMPLAINTS = [
    { value: 'validated', label: 'Falta de respeto / Ensucia auto' },
    { value: 'fraud', label: 'Fraude / Intento de robo / Acoso' }
];

export default function RatingForm({ 
  participantName, 
  participantRole, 
  onSubmit, 
  isSubmitted, 
  photoURL,
  submitButtonText = "Enviar Opinión",
  initialFeedbackType,
  initialComment
}: RatingFormProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [reason, setReason] = useState<string>('');
  const [comments, setComments] = useState('');

  const handleSubmit = () => {
    if (!feedback) return;
    if (feedback === 'thumbs_down' && !reason) return; // Forzar razón si es pulgar abajo
    onSubmit(feedback, reason, comments);
  };

  if (isSubmitted) {
    return (
         <CardContent className="pt-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-2xl shadow-inner">
                <div className="flex flex-col items-center text-center">
                    <p className="font-black tracking-widest uppercase text-zinc-500 flex items-center justify-center gap-2 text-[10px] mb-3">
                        <VamoIcon name="shield-check" className="w-4 h-4 text-emerald-500"/> Opinión Guardada
                    </p>
                    
                    {initialFeedbackType ? (
                        <div className="flex gap-1 mb-3">
                            <VamoIcon
                                name={initialFeedbackType === 'thumbs_up' ? "thumbs-up" : "thumbs-down"}
                                className={cn(
                                    "w-8 h-8",
                                    initialFeedbackType === 'thumbs_up' ? "text-emerald-400" : "text-rose-500"
                                )}
                            />
                        </div>
                    ) : null}

                    {initialComment ? (
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 w-full">
                            <p className="text-xs text-zinc-300 italic leading-relaxed font-medium">
                                "{initialComment}"
                            </p>
                        </div>
                    ) : (
                        <p className="text-[10px] text-zinc-600 font-bold uppercase italic">Sin comentarios adicionales</p>
                    )}
                </div>
            </div>
        </CardContent>
    );
  }

  const complaintsList = participantRole === 'conductor' ? DRIVER_COMPLAINTS : PASSENGER_COMPLAINTS;

  return (
    <>
      <CardHeader className="pt-6 flex flex-col items-center text-center">
        {photoURL ? (
            <img src={photoURL} alt={participantName} className="w-20 h-20 rounded-full object-cover mb-4 border-4 border-primary/20 shadow-xl" />
        ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-4 border-4 border-white/5 shadow-xl">
                <VamoIcon name="user" className="w-10 h-10 text-zinc-600" />
            </div>
        )}
        <CardTitle className='text-xl font-black uppercase tracking-tight'>¿Cómo fue tu viaje?</CardTitle>
        <CardDescription className="text-xs font-bold uppercase tracking-widest text-zinc-500">con {participantName}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex justify-center gap-8">
            <button 
                onClick={() => { setFeedback('thumbs_up'); setReason(''); }}
                className={cn(
                    "flex flex-col items-center gap-3 transition-all duration-300 transform",
                    feedback === 'thumbs_up' ? "scale-110 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]" : "opacity-60 hover:opacity-100 hover:scale-105"
                )}
            >
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center border-2", feedback === 'thumbs_up' ? "bg-emerald-500/20 border-emerald-500" : "bg-zinc-900 border-zinc-700")}>
                    <VamoIcon name="thumbs-up" className={cn("w-8 h-8", feedback === 'thumbs_up' ? "text-emerald-400" : "text-zinc-500")} />
                </div>
                <span className={cn("text-xs font-black uppercase tracking-widest", feedback === 'thumbs_up' ? "text-emerald-400" : "text-zinc-500")}>Excelente</span>
            </button>

            <button 
                onClick={() => setFeedback('thumbs_down')}
                className={cn(
                    "flex flex-col items-center gap-3 transition-all duration-300 transform",
                    feedback === 'thumbs_down' ? "scale-110 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "opacity-60 hover:opacity-100 hover:scale-105"
                )}
            >
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center border-2", feedback === 'thumbs_down' ? "bg-rose-500/20 border-rose-500" : "bg-zinc-900 border-zinc-700")}>
                    <VamoIcon name="thumbs-down" className={cn("w-8 h-8", feedback === 'thumbs_down' ? "text-rose-500" : "text-zinc-500")} />
                </div>
                <span className={cn("text-xs font-black uppercase tracking-widest", feedback === 'thumbs_down' ? "text-rose-500" : "text-zinc-500")}>Tuve Problemas</span>
            </button>
        </div>

        {feedback === 'thumbs_down' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300 bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">
                <p className="text-xs text-rose-400 font-bold uppercase text-center tracking-widest">¿Qué pasó?</p>
                <div className="flex flex-col gap-2">
                    {complaintsList.map(comp => (
                        <button
                            key={comp.value}
                            onClick={() => setReason(comp.value)}
                            className={cn(
                                "text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                                reason === comp.value 
                                    ? "bg-rose-500/20 border-rose-500 text-rose-300" 
                                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800"
                            )}
                        >
                            {comp.label}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {feedback && (
            <div className="animate-in fade-in duration-500">
                <Textarea
                    placeholder="Dejá un comentario (opcional)..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="bg-zinc-900 border-white/5"
                />
            </div>
        )}
      </CardContent>

       <CardFooter>
            <Button 
                onClick={handleSubmit} 
                className={cn(
                    "w-full font-black uppercase tracking-widest h-14 rounded-2xl transition-all shadow-xl",
                    feedback === 'thumbs_up' ? "bg-emerald-600 hover:bg-emerald-500 text-white" : 
                    feedback === 'thumbs_down' ? "bg-rose-600 hover:bg-rose-500 text-white" : ""
                )} 
                disabled={!feedback || (feedback === 'thumbs_down' && !reason)}
            >
                {submitButtonText}
            </Button>
      </CardFooter>
    </>
  );
}
