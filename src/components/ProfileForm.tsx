// src/components/ProfileForm.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
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
import { Edit2, UploadCloud, CheckCircle } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';

const profileSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  isDriver: z.boolean().default(false),
  carModelYear: z.number().nullable().optional(),
  cedulaUploaded: z.boolean().default(false),
  seguroUploaded: z.boolean().default(false),
  dniUploaded: z.boolean().default(false),
});


type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  userProfile: UserProfile | null;
  onSave: (data: Partial<UserProfile & ProfileFormData>) => void;
  onCancel: () => void;
  isDialog?: boolean;
}

export default function ProfileForm({ userProfile, onSave, onCancel, isDialog = false }: ProfileFormProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(userProfile?.photoURL || null);
  
  const { control, register, handleSubmit, watch, formState: { errors, isValid }, setValue, trigger } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
    defaultValues: {
      name: userProfile?.name || '',
      isDriver: userProfile?.isDriver || false,
      carModelYear: userProfile?.carModelYear || null,
      cedulaUploaded: false,
      seguroUploaded: false,
      dniUploaded: false,
    },
  });

  const isDriver = watch('isDriver');
  
  useEffect(() => {
    // When the driver switch changes, re-validate the form
    trigger();
  }, [isDriver, trigger]);

  const onSubmit = (data: ProfileFormData) => {
     if (data.isDriver) {
      const missingDocs = [];
      if (!data.carModelYear) missingDocs.push("año del modelo");
      if (!data.cedulaUploaded) missingDocs.push("cédula");
      if (!data.seguroUploaded) missingDocs.push("seguro");
      if (!data.dniUploaded) missingDocs.push("DNI");
      
      if (missingDocs.length > 0) {
        toast({
          variant: "destructive",
          title: "Faltan datos para ser conductor",
          description: `Por favor, completá lo siguiente: ${missingDocs.join(', ')}.`,
        });
        return;
      }
    }
    onSave({ ...data, photoURL: photoUrl });
  };
  
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
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
  
  const handleDocUpload = (field: 'cedulaUploaded' | 'seguroUploaded' | 'dniUploaded') => {
      setValue(field, true, { shouldValidate: true });
  }


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
                        disabled={userProfile?.vehicleVerificationStatus === 'approved' || userProfile?.vehicleVerificationStatus === 'pending_review'}
                    />
                 )}
            />
          </div>

          {isDriver && (
            <div className="space-y-4 pt-2">
               <Separator />
               <h4 className="font-medium text-center">Datos del Vehículo y Conductor</h4>
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
                  <Label>Documentación requerida</Label>
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal gap-2" onClick={() => handleDocUpload('cedulaUploaded')} >
                    {watch('cedulaUploaded') ? <CheckCircle className="text-green-500"/> : <UploadCloud />}
                    Cédula del vehículo
                  </Button>

                   <Button type="button" variant="outline" className="w-full justify-start text-left font-normal gap-2" onClick={() => handleDocUpload('seguroUploaded')}>
                    {watch('seguroUploaded') ? <CheckCircle className="text-green-500"/> : <UploadCloud />}
                    Comprobante de seguro al día
                  </Button>

                   <Button type="button" variant="outline" className="w-full justify-start text-left font-normal gap-2" onClick={() => handleDocUpload('dniUploaded')}>
                    {watch('dniUploaded') ? <CheckCircle className="text-green-500"/> : <UploadCloud />}
                    DNI (frente y dorso)
                  </Button>
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
