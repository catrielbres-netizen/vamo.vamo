'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CURRENT_TERMS_VERSION } from '@/lib/legal-config';

// --- Steps Configuration ---
const STEPS = [
  { id: 'personal', title: 'Datos Personales', icon: 'user' },
  { id: 'vehicle', title: 'Tu Vehículo', icon: 'car' },
  { id: 'type', title: 'Tipo de Conductor', icon: 'shield' },
  { id: 'finish', title: 'Finalizar', icon: 'check-circle' },
];

export function DriverOnboardingWizard() {
  const { user, firestore, storage, functions } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  console.log("[ONBOARDING_DEBUG] DriverOnboardingWizard mount - UID:", user?.uid, "Step:", currentStep);

  // --- Form State ---
  const [formData, setFormData] = useState({
    name: '',
    dni: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    year: '',
    plate: '',
    color: '',
    cityKey: 'rawson' as 'rawson' | 'trelew' | 'comodoro',
    driverSubtype: 'express' as 'professional' | 'express',
    termsAccepted: false,
  });

  // --- Documents State ---
  const [docs, setDocs] = useState<{
    dniPhoto: File | null;
    licensePhoto: File | null;
    insurancePhoto: File | null;
    vehicleCardPhoto: File | null;
    vehicleFrontPhoto: File | null;
    vehicleBackPhoto: File | null;
    vehicleInteriorPhoto: File | null;
    profilePhoto: File | null;
  }>({
    dniPhoto: null,
    licensePhoto: null,
    insurancePhoto: null,
    vehicleCardPhoto: null,
    vehicleFrontPhoto: null,
    vehicleBackPhoto: null,
    vehicleInteriorPhoto: null,
    profilePhoto: null,
  });

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  // --- Load Existing Data ---
  useEffect(() => {
    if (!user || !firestore) return;

    const loadData = async () => {
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setFormData({
            name: data.name || '',
            dni: data.dni || '',
            phone: data.phone || '',
            email: data.email || user.email || '',
            brand: data.vehicle?.brand || '',
            model: data.vehicle?.model || '',
            year: data.vehicle?.year?.toString() || data.carModelYear?.toString() || '',
            plate: data.vehicle?.plate || data.plateNumber || '',
            color: data.vehicle?.color || '',
            cityKey: data.cityKey || 'rawson',
            driverSubtype: data.driverSubtype || 'express',
          });
          
          if (data.documents) {
            setDocUrls(data.documents);
          }
        } else {
          setFormData(prev => ({ ...prev, email: user.email || '' }));
        }
      } catch (e) {
        console.error("Error loading driver data:", e);
      } finally {
        setFetching(false);
      }
    };

    loadData();
  }, [user, firestore]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'plate') {
        setFormData(prev => ({ ...prev, [name]: value.toUpperCase().replace(/[^A-Z0-9]/g, '') }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, key: keyof typeof docs) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocs(prev => ({ ...prev, [key]: file }));
    
    // Preview only for images
    if (file.type.startsWith('image/')) {
        setPreviews(prev => ({ ...prev, [key]: URL.createObjectURL(file) }));
    } else if (file.type === 'application/pdf') {
        // Placeholder for PDF
        setPreviews(prev => ({ ...prev, [key]: 'https://cdn-icons-png.flaticon.com/512/337/337946.png' }));
    }
  };

  const validateFile = (file: File, field: string) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeType = file.type.toLowerCase();

    console.log("[ONBOARDING_FILE_DEBUG]", {
      field,
      fileName: file.name,
      fileType: mimeType,
      fileSize: file.size,
      extension,
      allowedTypes,
      allowedExtensions
    });

    const isAllowedMime = allowedTypes.includes(mimeType);
    const isAllowedExt = allowedExtensions.includes(extension);

    // Si el MIME viene vacío (común en algunos navegadores/archivos), validamos por extensión
    if (!mimeType && isAllowedExt) {
        return { valid: true, mimeToUse: `image/${extension === 'pdf' ? 'pdf' : extension}`.replace('image/pdf', 'application/pdf') };
    }

    if (!isAllowedMime && !isAllowedExt) {
        return { valid: false, reason: 'Tipo de archivo no permitido. Solo se aceptan JPG, PNG, WEBP y PDF.' };
    }

    return { valid: true, mimeToUse: mimeType || (extension === 'pdf' ? 'application/pdf' : `image/${extension}`) };
  };

  const uploadFile = async (file: File, key: string, customPath?: string): Promise<{ url: string, path: string }> => {
    return new Promise((resolve, reject) => {
      const storagePath = customPath || `drivers/${user!.uid}/docs/${key}_${Date.now()}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [key]: progress }));
        },
        (error) => reject(error),
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ url, path: storagePath });
        }
      );
    });
  };

  const nextStep = () => {
    // Validation
    if (currentStep === 1) {
      if (!formData.name || !formData.dni || !formData.phone || (!docs.profilePhoto && !docUrls.profilePhoto)) {
        return toast({ variant: 'destructive', title: 'Campos incompletos', description: 'Por favor completá todos los datos personales y subí tu foto de perfil.' });
      }
    }
    if (currentStep === 2) {
      const year = parseInt(formData.year, 10);
      const currentYear = new Date().getFullYear();
      if (!formData.brand || !formData.model || !formData.plate || !formData.color || !formData.year) {
        return toast({ variant: 'destructive', title: 'Campos incompletos', description: 'Por favor completá los datos del vehículo.' });
      }
      if (isNaN(year) || year < 1990 || year > currentYear + 1) {
        return toast({ variant: 'destructive', title: 'Año inválido', description: 'El año del vehículo debe ser entre 1990 y el actual.' });
      }
      if (!docs.vehicleFrontPhoto && !docUrls.vehicleFront) {
        return toast({ variant: 'destructive', title: 'Foto obligatoria', description: 'Por favor subí una foto frontal de tu vehículo.' });
      }
    }

    if (currentStep === 4) {
      if (!formData.termsAccepted) {
        return toast({ variant: 'destructive', title: 'Acuerdo legal', description: 'Debés aceptar los términos y condiciones para continuar.' });
      }
    }
    
    if (currentStep < STEPS.length) setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const finishOnboarding = async () => {
    if (!user || !firestore) return;

    setLoading(true);
    console.log("[DRIVER_ONBOARDING_SUBMIT_START]", { formData, docs: Object.keys(docs).filter(k => !!docs[k as keyof typeof docs]) });
    console.log("[ONBOARDING_WRITE] Starting process for UID:", user.uid);
    
    try {
      // 1. Upload remaining documents
      const finalDocUrls: Record<string, string> = { ...docUrls };
      const uploadPromises = [];

      console.log("[DRIVER_ONBOARDING_UPLOAD_START] Starting document uploads...");
      
      const wrapUpload = async (file: File, key: string) => {
        console.log(`[ONBOARDING_WRITE] start upload: ${key}`);
        
        const validation = validateFile(file, key);
        if (!validation.valid) {
            console.error(`[ONBOARDING_FILE_ERROR] ${key}: ${validation.reason}`);
            throw new Error(validation.reason);
        }

        try {
          const { url, path } = await uploadFile(file, key);
          
          // 1.5 Register Document Authority (FASE 2A)
          console.log(`[ONBOARDING_WRITE] registering authority: ${key}`);
          const submitDoc = httpsCallable(functions!, 'submitDocumentV1');
          await submitDoc({
            ownerUid: user!.uid,
            docType: key,
            category: 'municipal',
            storagePath: path,
            downloadURL: url,
            contentType: validation.mimeToUse || file.type,
            originalFilename: file.name
          });

          console.log(`[ONBOARDING_WRITE] success upload & registration: ${key}`);
          finalDocUrls[key] = url;
        } catch (e) {
          console.error(`[ONBOARDING_WRITE] fail upload/registration: ${key}`, e);
          throw e;
        }
      };

      // Mandatory Photos with fixed paths
      const uploadAsset = async (file: File, key: string, path: string, stateKey: string) => {
        console.log(`[ONBOARDING_WRITE] uploading asset: ${key} to ${path}`);
        const { url } = await uploadFile(file, key, path);
        finalDocUrls[stateKey] = url;
      };

      if (docs.profilePhoto) {
        uploadPromises.push(uploadAsset(docs.profilePhoto, 'profilePhoto', `drivers/${user!.uid}/profile/profile.jpg`, 'profilePhoto'));
      }
      if (docs.vehicleFrontPhoto) {
        uploadPromises.push(uploadAsset(docs.vehicleFrontPhoto, 'vehicleFrontPhoto', `drivers/${user!.uid}/vehicle/front.jpg`, 'vehicleFront'));
      }
      
      await Promise.all(uploadPromises);
      console.log("[DRIVER_ONBOARDING_UPLOAD_OK] Required photos uploaded successfully.");

      // Final validation: Only profile photo and vehicle front are mandatory now
      if ((!finalDocUrls.profilePhoto && !docUrls.profilePhoto) || (!finalDocUrls.vehicleFront && !docUrls.vehicleFront)) {
        setLoading(false);
        return toast({ variant: 'destructive', title: 'Fotos incompletas', description: 'Debés subir tu foto de perfil y la foto frontal del vehículo.' });
      }

      // 2. Call Secure Cloud Function (Fase 4C)
      console.log("[DRIVER_ONBOARDING_CALLABLE_START] Calling completeDriverOnboardingV1...");
      const completeDriverOnboarding = httpsCallable(functions!, 'completeDriverOnboardingV1');
      
      await completeDriverOnboarding({
        name: formData.name,
        dni: formData.dni,
        phone: formData.phone.replace(/[\s\-\+()]/g, ''),
        vehicle: {
          brand: formData.brand,
          model: formData.model,
          year: parseInt(formData.year, 10),
          plate: formData.plate.toUpperCase().trim(),
          color: formData.color,
        },
        plateNumber: formData.plate.toUpperCase().trim(),
        carModelYear: parseInt(formData.year, 10),
        cityKey: formData.cityKey,
        driverSubtype: formData.driverSubtype,
        termsAccepted: true,
        driverTermsAccepted: true,
        acceptedDriverTerms: true,
        termsVersion: CURRENT_TERMS_VERSION, // Consistent with legal-config
        documents: finalDocUrls,
        photoURL: finalDocUrls.profilePhoto || docUrls.profilePhoto,
        vehiclePhotoFrontUrl: finalDocUrls.vehicleFront || docUrls.vehicleFront,
        vehiclePhotos: {
          front: finalDocUrls.vehicleFront || docUrls.vehicleFront,
          back: finalDocUrls.vehicleBack || docUrls.vehicleBack,
          interior: finalDocUrls.vehicleInterior || docUrls.vehicleInterior,
        }
      });

      console.log("[DRIVER_ONBOARDING_CALLABLE_OK] Success.");
      console.log("[DRIVER_ONBOARDING_STATUS_PENDING_REVIEW] municipalStatus set to pending_municipal_review");
      console.log("[DRIVER_ONBOARDING_REDIRECT_STATUS] Preparing to show success modal.");

      // [VamO SAFETY] Signal to AuthGuard that onboarding just completed.
      // This prevents a false redirect to /driver/login if Firebase Auth
      // re-hydration is slower than the guard evaluation on next page load.
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('driverOnboardingJustCompleted', 'true');
      }

      toast({
        title: '¡Registro completo!',
        description: 'Tu perfil ha sido enviado para revisión municipal.',
      });

      setIsSuccessModalOpen(true);
    } catch (error: any) {
      console.error("[DRIVER_ONBOARDING_ERROR] FATAL ERROR:", error);
      toast({ 
        variant: 'destructive', 
        title: 'Error al finalizar', 
        description: error.message || 'No se pudo completar el registro. Por favor reintenta.' 
      });
    } finally {
      console.log("[DRIVER_ONBOARDING_FINALLY] Submission process ended.");
      setLoading(false);
    }
  };

  if (fetching) return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><VamoIcon name="loader" className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <VamoLogo variant="navbar" />
          <div className="space-y-1">
            <h1 className="text-2xl font-black uppercase tracking-tighter">Registro de Conductor</h1>
            <p className="text-zinc-500 text-sm">Completá los pasos para empezar a trabajar</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <span>Paso {currentStep} de {STEPS.length}</span>
            <span>{Math.round((currentStep / STEPS.length) * 100)}% completado</span>
          </div>
          <Progress value={(currentStep / STEPS.length) * 100} className="h-1.5 bg-zinc-900 border border-white/5" />
        </div>

        {/* Wizard Card */}
        <Card className="bg-zinc-900/50 border-white/5 shadow-2xl backdrop-blur-md rounded-3xl overflow-hidden">
            <div key={currentStep}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <VamoIcon name={STEPS[currentStep - 1].icon as any} className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">{STEPS[currentStep - 1].title}</CardTitle>
                    <CardDescription className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Paso obligatorio</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4">
                {/* --- STEP 1: PERSONAL --- */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400">Nombre Completo</Label>
                      <Input name="name" value={formData.name} onChange={handleInputChange} placeholder="Ej: Juan Pérez" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400">DNI / Documento</Label>
                      <Input name="dni" value={formData.dni} onChange={handleInputChange} placeholder="Ej: 35.000.000" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400">Teléfono (WhatsApp)</Label>
                        <Input 
                          name="phone" value={formData.phone} onChange={handleInputChange} 
                          placeholder="Ej: 2804556677" 
                          className="h-12 bg-white/5 border-white/5 rounded-xl"
                         />
                    </div>

                    <div className="space-y-4 pt-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400 block mb-2">Foto de Perfil (Obligatoria)</Label>
                        <div 
                            className="w-32 h-32 rounded-3xl bg-white/5 border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-indigo-500/50 transition-all mx-auto"
                            onClick={() => document.getElementById('input-profilePhoto')?.click()}
                        >
                            {(previews.profilePhoto || docUrls.profilePhoto) ? (
                                <img src={previews.profilePhoto || docUrls.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <VamoIcon name="camera" className="w-8 h-8 text-zinc-700 group-hover:text-indigo-400 transition-colors" />
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase mt-1">Subir Foto</span>
                                </>
                            )}
                            <input 
                                id="input-profilePhoto" type="file" accept="image/*" className="hidden" 
                                onChange={(e) => handleFileChange(e, 'profilePhoto')} 
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500 text-center italic">Esta foto será visible para tus pasajeros durante los viajes.</p>
                    </div>

                    {/* Ciudad: Solo mostramos selector si no viene ya pre-cargada del registro inicial */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400">Ciudad de Operación</Label>
                        <Select 
                          value={formData.cityKey} 
                          onValueChange={(val: any) => setFormData(prev => ({ ...prev, cityKey: val }))}
                        >
                          <SelectTrigger className="h-12 bg-white/5 border-white/5 rounded-xl text-white">
                            <SelectValue placeholder="Seleccioná tu ciudad" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-white/10 text-white">
                            <SelectItem value="rawson">Rawson / Playa Unión</SelectItem>
                            <SelectItem value="trelew">Trelew</SelectItem>
                            <SelectItem value="madryn">Puerto Madryn</SelectItem>
                            <SelectItem value="comodoro">Comodoro Rivadavia</SelectItem>
                            <SelectItem value="esquel">Esquel</SelectItem>
                            <SelectItem value="sarmiento">Sarmiento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label>
                      <Input value={formData.email} readOnly className="h-12 bg-white/5 border-white/5 rounded-xl opacity-50" />
                    </div>
                  </div>
                )}

                {/* --- STEP 2: VEHICLE --- */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400">Marca</Label>
                        <Input name="brand" value={formData.brand} onChange={handleInputChange} placeholder="Ej: Toyota" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400">Modelo</Label>
                        <Input name="model" value={formData.model} onChange={handleInputChange} placeholder="Ej: Corolla" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400">Año</Label>
                        <Input name="year" type="number" min={1990} max={new Date().getFullYear() + 1} value={formData.year} onChange={handleInputChange} placeholder="2025" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400">Patente</Label>
                        <Input name="plate" value={formData.plate} onChange={handleInputChange} placeholder="AB123CD" className="h-12 bg-white/5 border-white/5 rounded-xl uppercase font-mono" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400">Color</Label>
                      <Input name="color" value={formData.color} onChange={handleInputChange} placeholder="Ej: Blanco" className="h-12 bg-white/5 border-white/5 rounded-xl" />
                    </div>

                    <div className="space-y-4 pt-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400 block mb-2">Foto Frontal del Vehículo (Obligatoria)</Label>
                        <div 
                            className="w-full h-48 rounded-3xl bg-white/5 border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-indigo-500/50 transition-all"
                            onClick={() => document.getElementById('input-vehicleFrontPhoto')?.click()}
                        >
                            {(previews.vehicleFrontPhoto || docUrls.vehicleFront) ? (
                                <img src={previews.vehicleFrontPhoto || docUrls.vehicleFront} alt="Vehicle Front" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <VamoIcon name="camera" className="w-10 h-10 text-zinc-700 group-hover:text-indigo-400 transition-colors" />
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase mt-2">Subir Foto del Auto</span>
                                </>
                            )}
                            <input 
                                id="input-vehicleFrontPhoto" type="file" accept="image/*" className="hidden" 
                                onChange={(e) => handleFileChange(e, 'vehicleFrontPhoto')} 
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500 text-center italic">Asegurate que la patente sea legible en la foto.</p>
                    </div>
                  </div>
                )}

                {/* --- STEP 3: TYPE --- */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-400 mb-4">Seleccioná cómo vas a trabajar. Esto define tu comisión y beneficios.</p>
                    <div className="grid grid-cols-1 gap-4">
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, driverSubtype: 'express' }))}
                        className={cn(
                          "p-6 rounded-3xl border text-left transition-all",
                          formData.driverSubtype === 'express' 
                            ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                            : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-lg font-black uppercase italic tracking-tighter">Particular (Express)</span>
                          {formData.driverSubtype === 'express' && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                        </div>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">Vehículo propio. Operás como conductor particular dentro de VamO.</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, driverSubtype: 'professional' }))}
                        className={cn(
                          "p-6 rounded-3xl border text-left transition-all",
                          formData.driverSubtype === 'professional' 
                            ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                            : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-lg font-black uppercase italic tracking-tighter">Taxi / Remis</span>
                          {formData.driverSubtype === 'professional' && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                        </div>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">Vehículo habilitado por el municipio.</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* --- STEP 4: (ELIMINADO) --- */}

                {/* --- STEP 4: FINISH --- */}
                {currentStep === 4 && (
                  <div className="text-center space-y-6 py-8">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto border border-emerald-500/30">
                      <VamoIcon name="check-circle" className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase tracking-tighter italic">¡Todo listo!</h3>
                      <p className="text-zinc-500 text-sm max-w-xs mx-auto">Al finalizar, enviaremos tus datos para la aprobación municipal.</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-white/5 text-left space-y-2">
                        <div className="flex justify-between text-[11px] uppercase tracking-widest font-black text-zinc-500">
                            <span>Resumen de Registro</span>
                            <span className="text-indigo-400">{formData.driverSubtype === 'express' ? 'Particular' : 'Taxi / Remis'}</span>
                        </div>
                        <div className="text-sm font-medium">
                            <p>{formData.name}</p>
                            <p className="text-zinc-400">{formData.brand} {formData.model} {formData.year} • {formData.color}</p>
                            <p className="text-zinc-400 font-mono tracking-widest text-xs mt-1">PATENTE: {formData.plate}</p>
                        </div>
                    </div>

                    <div className="pt-4 flex items-start gap-3 px-2 text-left">
                        <div 
                          className={cn(
                            "h-5 w-5 rounded border flex items-center justify-center mt-0.5 cursor-pointer transition-colors",
                            formData.termsAccepted ? "bg-indigo-600 border-indigo-600" : "border-zinc-700 hover:border-zinc-500"
                          )}
                          onClick={() => setFormData(p => ({ ...p, termsAccepted: !p.termsAccepted }))}
                        >
                          {formData.termsAccepted && <VamoIcon name="check" className="h-3 w-3 text-white" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-tight">
                            Acepto los <span className="text-indigo-400 font-bold">Términos y Condiciones</span> y el tratamiento de mis datos personales para operar en VamO.
                        </p>
                    </div>
                  </div>
                )}
              </CardContent>

              {/* Navigation */}
              <div className="p-6 pt-2 flex gap-4">
                {currentStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    disabled={loading}
                    className="flex-1 h-14 rounded-2xl border-white/5 bg-white/5 hover:bg-white/10 font-bold uppercase tracking-widest"
                  >
                    Volver
                  </Button>
                )}
                <Button
                  onClick={currentStep === STEPS.length ? finishOnboarding : nextStep}
                  disabled={loading}
                  className={cn(
                    "flex-1 h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95",
                    currentStep === STEPS.length ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
                  )}
                >
                  {loading ? <VamoIcon name="loader" className="w-5 h-5 animate-spin" /> : currentStep === STEPS.length ? 'Finalizar' : 'Siguiente'}
                </Button>
              </div>
            </div>
        </Card>

        <Dialog open={isSuccessModalOpen} onOpenChange={() => {}}>
            <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 rounded-[2rem] p-8 text-center space-y-6" onInteractOutside={(e) => e.preventDefault()}>
                {/* Radix requires DialogTitle to avoid runtime error */}
                <DialogTitle className="sr-only">Registro de conductor completado</DialogTitle>

                <div className="relative mx-auto w-20 h-20">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping opacity-20" />
                    <div className="relative flex items-center justify-center w-full h-full bg-green-500/10 rounded-full border border-green-500/30">
                        <VamoIcon name="check" className="h-10 w-10 text-green-500" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">¡Registro Enviado!</h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Tu perfil de conductor ha sido creado y enviado para revisión municipal. Ya podés acceder a tu panel para ver tu estado.
                    </p>
                </div>

                <Button 
                    onClick={() => {
                        window.location.assign('/driver/rides');
                    }}
                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/10"
                >
                    Ir a mi Panel →
                </Button>
            </DialogContent>
        </Dialog>

        {/* Support Link */}
        <p className="text-center text-xs text-zinc-500">
            ¿Necesitás ayuda? <a href="#" className="text-indigo-400 hover:underline">Contactar a soporte</a>
        </p>
      </div>
    </div>
  );
}
