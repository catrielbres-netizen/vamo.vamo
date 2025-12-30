
// src/components/ProfileForm.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Edit2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { Separator } from './ui/separator';

const profileSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  isDriver: z.boolean().default(false),
  carModelYear: z.number().nullable().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  userProfile: UserProfile | null;
  onSave: (data: Partial<UserProfile>) => void;
  onCancel: () => void;
}

export default function ProfileForm({ userProfile, onSave, onCancel }: ProfileFormProps) {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(userProfile?.photoURL || null);

  const { control, register, handleSubmit, watch, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: userProfile?.name || '',
      isDriver: userProfile?.isDriver || false,
      carModelYear: userProfile?.carModelYear || null,
    },
  });

  const isDriver = watch('isDriver');

  const onSubmit = (data: ProfileFormData) => {
    onSave({ ...data, photoURL: photoUrl });
  };
  
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // In a real app, upload to Firebase Storage and get URL.
      // Here, we'll simulate with a local blob URL for immediate preview.
      const blobUrl = URL.createObjectURL(file);
      setPhotoUrl(blobUrl);
    }
  };
  
  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length > 1) return `${names[0][0]}${names[names.length - 1][0]}`;
    return name[0];
  }
  
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= currentYear - 20; year--) {
      years.push(year);
    }
    return years;
  };

  return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-6 pt-6">
            <div className="flex justify-center">
                 <div className="relative">
                    <button type="button" onClick={handleAvatarClick} className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full">
                        <Avatar className="w-24 h-24 text-lg">
                            <AvatarImage src={photoUrl || user?.photoURL || undefined} />
                            <AvatarFallback>{getInitials(userProfile?.name)}</AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/80">
                            <Edit2 className="w-4 h-4" />
                        </div>
                     </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*"
                    />
                </div>
            </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre y Apellido</Label>
            <Input id="name" {...register('name')} placeholder="Ej: Juan Pérez" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
                <Label htmlFor="isDriver">Quiero conducir para VamO</Label>
                 <p className="text-xs text-muted-foreground">
                    Activá esta opción para registrarte como conductor.
                </p>
            </div>
             <Controller
                control={control}
                name="isDriver"
                render={({ field }) => (
                    <Switch
                        id="isDriver"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                    />
                 )}
            />
          </div>

          {isDriver && (
            <div className="space-y-4 pt-2">
               <Separator />
               <h4 className="font-medium text-center">Datos del Vehículo</h4>
               <div className="space-y-2">
                 <Label htmlFor="carModelYear">Año del modelo</Label>
                 <Controller
                    control={control}
                    name="carModelYear"
                    render={({ field }) => (
                       <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} defaultValue={field.value?.toString()}>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccioná el año" />
                        </SelectTrigger>
                        <SelectContent>
                            {generateYearOptions().map(year => (
                                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                            ))}
                        </SelectContent>
                       </Select>
                    )}
                />
               </div>
               <div className="text-xs text-muted-foreground p-3 bg-secondary rounded-md">
                 <p>Tu tipo de servicio (Premium, Privado, Express) será asignado automáticamente según el año de tu vehículo.</p>
               </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
           <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
           <Button type="submit">Guardar Perfil</Button>
        </CardFooter>
      </form>
  );
}
