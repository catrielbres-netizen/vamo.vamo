// @/components/RatingForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface RatingFormProps {
  participantName: string;
  participantRole: 'conductor' | 'pasajero';
  onSubmit: (rating: number, comments: string) => void;
  isSubmitted: boolean;
}

export default function RatingForm({ participantName, participantRole, onSubmit, isSubmitted }: RatingFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState('');

  const handleSubmit = () => {
    if (rating > 0) {
      onSubmit(rating, comments);
    }
  };

  return (
    <Card className="mt-4 border-primary">
      <CardHeader>
        <CardTitle className='text-base'>Calificá a tu {participantRole}</CardTitle>
        <CardDescription>{participantName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSubmitted ? (
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
                <p className="font-semibold text-primary">¡Gracias por tu calificación!</p>
                <p className="text-sm text-muted-foreground">Tu opinión nos ayuda a mejorar.</p>
            </div>
        ) : (
            <>
                <div className="flex justify-center items-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                    key={star}
                    className={cn(
                        'w-8 h-8 cursor-pointer transition-colors',
                        star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-muted-foreground/50'
                    )}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    />
                ))}
                </div>
                <Textarea
                placeholder="Dejá un comentario (opcional)..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                />
                <Button onClick={handleSubmit} disabled={rating === 0} className="w-full">
                Enviar Calificación
                </Button>
            </>
        )}
      </CardContent>
    </Card>
  );
}
