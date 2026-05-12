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
  onSubmit: (rating: number, comments: string) => void;
  isSubmitted: boolean;
  photoURL?: string | null;
  submitButtonText?: string;
  postSubmitMessage?: string;
  initialRating?: number;
  initialComment?: string;
}

export default function RatingForm({ 
  participantName, 
  participantRole, 
  onSubmit, 
  isSubmitted, 
  photoURL,
  submitButtonText = "Enviar Calificación",
  postSubmitMessage,
  initialRating,
  initialComment
}: RatingFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState('');

  const handleSubmit = () => {
    onSubmit(rating, comments);
  };

  if (isSubmitted) {
    return (
         <CardContent className="pt-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-2xl shadow-inner">
                <div className="flex flex-col items-center text-center">
                    <p className="font-black tracking-widest uppercase text-zinc-500 flex items-center justify-center gap-2 text-[10px] mb-3">
                        <VamoIcon name="shield-check" className="w-4 h-4 text-emerald-500"/> Calificación Guardada
                    </p>
                    
                    {initialRating ? (
                        <div className="flex gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <VamoIcon
                                    key={star}
                                    name="star"
                                    className={cn(
                                        "w-5 h-5",
                                        star <= initialRating ? "text-yellow-400 fill-yellow-400" : "text-zinc-800"
                                    )}
                                />
                            ))}
                        </div>
                    ) : null}

                    {initialComment ? (
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 w-full">
                            <p className="text-xs text-zinc-300 italic italic leading-relaxed font-medium">
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
      <CardContent className="space-y-4">
        <div className="flex justify-center items-center space-x-1">
         {[1, 2, 3, 4, 5].map((star) => (
            <div 
              key={star}
              className="relative p-1"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
            >
                <VamoIcon
                    name="star"
                    className={cn(
                        'w-10 h-10 cursor-pointer transition-all duration-200 transform',
                        star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400 scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                        : 'text-zinc-800 scale-100'
                    )}
                />
            </div>
        ))}
        </div>
        <Textarea
        placeholder="Dejá un comentario (opcional)..."
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        className="bg-zinc-900 border-white/5"
        />
      </CardContent>
       <CardFooter>
            <Button onClick={handleSubmit} className="w-full font-black uppercase tracking-widest h-12 rounded-xl" disabled={rating === 0}>
                {submitButtonText}
            </Button>
      </CardFooter>
    </>
  );
}
