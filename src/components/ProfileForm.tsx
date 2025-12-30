// src/components/ProfileForm.tsx
'use client';
import { useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardContent, CardFooter } from '@/components/ui/card';
import { UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Edit2, UploadCloud } from 'lucide-react';
import { useUser } from '@/firebase';
import { Separator } from './ui/separator';

const profileSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  isDriver: z.boolean().default(false),
  carModelYear: z.number().nullable().optional(),
  vehicleProof: z.any().optional(), // For file upload
}).superRefine((data, ctx) => {
    if (data.isDriver && (data.carModelYear === null || data.carModelYear === undefined)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'El año del modelo es requerido para los conductores.',
            path: ['carModelYear'],
        });
    }
});


type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  userProfile: UserProfile | null;
  onSave: (data: Partial<UserProfile>) => void;
  onCancel: () => void;
  isDialog?: boolean;
}

export default function ProfileForm({ userProfile, onSave, onCancel, isDialog = true }: ProfileFormProps) {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vehicleProofInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(userProfile?.photoURL || null);
  const [vehicleProofFileName, setVehicleProofFileName] = useState<string | null>(null);

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

  const handleVehicleProofClick = () => {
    vehicleProofInputRef.current?.click();
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      setPhotoUrl(blobUrl);
    }
  };

  const handleVehicleProofFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        setVehicleProofFileName(file.name);
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
                            <AvatarFallback>{getInitials(userProfile?.name || user?.displayName)}</AvatarFallback>
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
                {errors.carModelYear && <p className="text-sm text-destructive">{errors.carModelYear.message}</p>}
               </div>
               
                <div className="space-y-2">
                  <Label>Comprobante del vehículo</Label>
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal" onClick={handleVehicleProofClick}>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {vehicleProofFileName ? <span className="text-primary truncate">{vehicleProofFileName}</span> : 'Subir título o cédula...'}
                  </Button>
                  <input
                        type="file"
                        ref={vehicleProofInputRef}
                        {...register('vehicleProof')}
                        onChange={handleVehicleProofFileChange}
                        className="hidden"
                        accept="image/*,application/pdf"
                    />
                </div>

               <div className="text-xs text-muted-foreground p-3 bg-secondary rounded-md">
                 <p>Un administrador verificará tus datos. Tu tipo de servicio (Premium, Privado, Express) será asignado una vez aprobado.</p>
               </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
            {isDialog && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
            <Button type="submit">Guardar Perfil</Button>
        </CardFooter>
      </form>
  );
}
