// @/components/RatingForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';

interface RatingFormProps {
  participantName: string;
  participantRole: 'conductor' | 'pasajero';
  onSubmit: (rating: number, comments: string) => void;
  isSubmitted: boolean;
  submitButtonText?: string;
}

export default function RatingForm({ participantName, participantRole, onSubmit, isSubmitted, submitButtonText = "Enviar Calificación" }: RatingFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState('');

  const handleSubmit = () => {
    // This function is now just a pass-through. 
    // The parent component will handle the logic of what to do.
    onSubmit(rating, comments);
  };

  if (isSubmitted) {
    // Don't render the form at all if already submitted, parent will handle next step
    return null;
  }

  return (
    <Card className="mt-4 border-primary">
      <CardHeader>
        <CardTitle className='text-base'>Calificá a tu {participantRole}</CardTitle>
        <CardDescription>{participantName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
            <VamoIcon
            name="star"
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
      </CardContent>
       <CardFooter>
            <Button onClick={handleSubmit} className="w-full">
                {submitButtonText}
            </Button>
      </CardFooter>
    </Card>
  );
}
