'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { ShieldCheck, ArrowRight, CheckCircle2, ChevronRight, Upload, AlertTriangle, AlertCircle, FileText, Camera } from 'lucide-react';
import { CURRENT_TERMS_VERSION } from "@/lib/legal-config";
import { CITIES } from '@/lib/cityData';
import { featureFlags, PLAN_B_DRIVER_SUBTYPE } from '@/config/features';
import { useActiveCities } from '@/hooks/useActiveCities';
import { CityHubAutocomplete } from '@/components/shared/CityHubAutocomplete';
import { canonicalCityKey } from '@/lib/cityUtils';
import { DriverSubtype } from '@/lib/types';
import { Scale } from 'lucide-react';
import { DriverSpecificTerms, LiabilityPolicyText, PrivacyPolicyText, CancellationPolicyText, VerificationPolicyText, SuspensionPolicyText, ScoringPolicyText } from '@/components/legal/LegalTexts';
import { DialogHeader, DialogDescription } from '@/components/ui/dialog';

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
  const { cities } = useActiveCities({ context: 'driver_recruitment' });

  console.log("[ONBOARDING_DEBUG] DriverOnboardingWizard mount - UID:", user?.uid, "Step:", currentStep);

  const [registrationCityKey, setRegistrationCityKey] = useState<string>('');

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
    cityKey: '',
    customCity: '',
    cityResolutionStatus: 'unresolved',
    cityResolutionSource: 'legacy_query_param',
    registrationLocation: null as any,
    identityStatus: 'unverified' as 'unverified' | 'pending' | 'verified',
    driverSubtype: PLAN_B_DRIVER_SUBTYPE as DriverSubtype,
    licenseExpiry: '',
    insuranceExpiry: '',
    criminalRecordExpiry: '',
    termsAccepted: false,
    fleetOwnerId: '',
    legalName: '',
    legalDni: '',
  });

  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (!isLegalModalOpen || hasScrolledToBottom) return;

      const observer = new IntersectionObserver(
          (entries) => {
              if (entries[0].isIntersecting) {
                  setHasScrolledToBottom(true);
              }
          },
          { root: null, threshold: 1.0 }
      );

      if (sentinelRef.current) {
          observer.observe(sentinelRef.current);
      }

      return () => observer.disconnect();
  }, [isLegalModalOpen, hasScrolledToBottom]);

  // --- Documents State ---
  const [docs, setDocs] = useState<{
    dniPhoto: File | null;
    dniBackPhoto: File | null;
    licensePhoto: File | null;
    insurancePhoto: File | null;
    criminalRecordPhoto: File | null;
    vehicleCardPhoto: File | null;
    vehicleFrontPhoto: File | null;
    vehicleBackPhoto: File | null;
    vehicleInteriorPhoto: File | null;
    profilePhoto: File | null;
  }>({
    dniPhoto: null,
    dniBackPhoto: null,
    licensePhoto: null,
    insurancePhoto: null,
    criminalRecordPhoto: null,
    vehicleCardPhoto: null,
    vehicleFrontPhoto: null,
    vehicleBackPhoto: null,
    vehicleInteriorPhoto: null,
    profilePhoto: null,
  });

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [isLocating, setIsLocating] = useState(false);

  const getCurrentLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Error', description: 'Tu navegador no soporta geolocalización.' });
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          if (!apiKey) throw new Error("Falta API Key de Google Maps");
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const addressComponents = data.results[0].address_components;
            let city = '';
            for (const component of addressComponents) {
              if (component.types.includes('locality')) {
                city = component.long_name;
                break;
              }
            }
            
            if (!city) {
                const fallback = addressComponents.find((c: any) => c.types.includes('administrative_area_level_2'));
                if (fallback) city = fallback.long_name;
            }

            if (city) {
              const normalizedCity = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              let foundKey = '';
              let resolvedName = '';
              
              for (const c of availableCities) {
                  // Direct match
                  const cityMatchName = c.name?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || '';
                  if (cityMatchName && normalizedCity.includes(cityMatchName)) {
                      foundKey = c.cityKey || c.id;
                      resolvedName = c.name;
                      break;
                  }
                  // Alias match
                  if (c.aliases && Array.isArray(c.aliases)) {
                      const aliasMatch = c.aliases.some((alias: string) => {
                          const normAlias = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                          return normalizedCity.includes(normAlias);
                      });
                      if (aliasMatch) {
                          foundKey = c.cityKey || c.id;
                          resolvedName = c.name;
                          break;
                      }
                  }
              }

              const isResolved = !!foundKey;
              const finalKey = foundKey ? canonicalCityKey(foundKey) : '';

              if (!finalKey) {
                  toast({ variant: 'destructive', title: 'Error', description: 'La ciudad no pudo ser identificada o no está en zona de cobertura.' });
                  setLoading(false);
                  return;
              }

              const regLocation = {
                  source: 'gps',
                  lat: lat,
                  lng: lng,
                  address: data.results[0].formatted_address || '',
                  detectedLocality: city,
                  detectedNeighborhood: '',
                  detectedProvince: '',
                  detectedCountry: 'Argentina',
                  resolvedMunicipalityKey: isResolved ? foundKey : '',
                  resolvedMunicipalityName: isResolved ? resolvedName : '',
                  resolvedCityKey: isResolved ? foundKey : '',
                  resolvedAt: new Date().toISOString()
              };

              setFormData(prev => ({ 
                ...prev, 
                cityKey: finalKey,
                customCity: !isResolved ? city : '',
                cityResolutionStatus: isResolved ? 'resolved' : 'outside_service_area',
                cityResolutionSource: 'gps',
                registrationLocation: regLocation
              }));
              if (isResolved) {
                  toast({ title: 'Ubicación obtenida', description: `Zona operativa detectada: ${resolvedName} (Localidad: ${city})` });
              } else {
                  toast({ variant: 'destructive', title: 'Fuera de zona', description: 'Por el momento no operamos en tu localidad.' });
              }
            } else {
              toast({ variant: 'destructive', title: 'Atención', description: 'No se pudo determinar la ciudad.' });
              setFormData(prev => ({ ...prev, cityKey: '', cityResolutionStatus: 'outside_service_area', cityResolutionSource: 'gps' }));
            }
          }
        } catch (error) {
          console.error(error);
          toast({ variant: 'destructive', title: 'Error', description: 'Error al obtener la ciudad.' });
          setFormData(prev => ({ ...prev, cityKey: '' }));
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error(error);
        toast({ variant: 'destructive', title: 'Permiso denegado', description: 'Por favor permite el acceso a tu ubicación.' });
        setIsLocating(false);
      }
    );
  };

  const [cityConfig, setCityConfig] = useState<any>(null);
  const [availableCities, setAvailableCities] = useState<any[]>([]);

  useEffect(() => {
    if (!firestore) return;
    const fetchCities = async () => {
      try {
        const querySnapshot = await getDocs(collection(firestore, 'cities'));
        const cities: any[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.enabled !== false) { // Default true or explicitly true
            cities.push({ id: doc.id, ...data });
          }
        });
        setAvailableCities(cities);
      } catch (error) {
        console.error('Error fetching available cities', error);
      }
    };
    fetchCities();
  }, [firestore]);

  const searchParams = useSearchParams();

  // --- Resolve Decoupled City Keys ---
  useEffect(() => {
    const resolveCityKeys = async () => {
      let resolvedRegistrationKey = '';

      // 0. URL param (highest priority for direct links like ?city=rawson)
      const urlCity = searchParams?.get('city') || searchParams?.get('registrationCityKey') || searchParams?.get('cityKey');
      if (urlCity) {
        resolvedRegistrationKey = urlCity.toLowerCase().trim();
      } else {
        // 1. Explicit city from query param (saved by ReferralPage)
        const explicitCity = localStorage.getItem('vamo_explicit_city_key');
        if (explicitCity) {
          resolvedRegistrationKey = explicitCity;
        } else {
          // 2. Referral code lookup
          const refCode = localStorage.getItem('referralCode');
          if (refCode && firestore) {
            try {
              const docRef = doc(firestore, 'referral_links', refCode);
              const snap = await getDoc(docRef);
              if (snap.exists() && snap.data().cityKey) {
                resolvedRegistrationKey = canonicalCityKey(snap.data().cityKey);
              } else if (snap.exists() && snap.data().city) {
                resolvedRegistrationKey = canonicalCityKey(snap.data().city);
              } else if (refCode.includes('RAWSON')) {
                // 3. Fallback temporal para compatibilidad legacy
                resolvedRegistrationKey = 'rawson';
              }
            } catch (e) {
              console.error('Error fetching referral link', e);
            }
          }
        }
      }

      setRegistrationCityKey(resolvedRegistrationKey);
    };

    resolveCityKeys();
  }, [firestore]);

  // Fetch City Config
  useEffect(() => {
    const targetKey = registrationCityKey || formData.cityKey;
    if (!targetKey || targetKey === 'other' || !firestore) return;
    const fetchCityConfig = async () => {
      try {
        const docRef = doc(firestore, 'cities', targetKey);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setCityConfig(snap.data()?.config || null);
        } else {
          setCityConfig(null);
        }
      } catch (error) {
        console.error('Error fetching city config', error);
      }
    };
    fetchCityConfig();
  }, [registrationCityKey, formData.cityKey, firestore]);

  // --- Load Existing Data ---
  useEffect(() => {
    if (!user || !firestore) return;

    const loadData = async () => {
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          const toDateStr = (ts: any) => {
            if (!ts || typeof ts.toDate !== 'function') return '';
            return ts.toDate().toISOString().split('T')[0];
          };
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
            cityKey: data.registrationCityKey || data.cityKey || '',
            customCity: '',
            identityStatus: data.identityStatus || 'unverified',
            driverSubtype: data.driverSubtype || PLAN_B_DRIVER_SUBTYPE,
            fleetOwnerId: data.fleetOwnerId || '',
            licenseExpiry: toDateStr(data.licenseExpiry),
            insuranceExpiry: toDateStr(data.insuranceExpiry),
            criminalRecordExpiry: toDateStr(data.criminalRecordExpiry),
            termsAccepted: true,
          });
          
          if (data.documents) {
            setDocUrls(data.documents);
          }
          
          if (data.registrationCityKey) setRegistrationCityKey(data.registrationCityKey);
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
  const isMunicipalStrict = !!registrationCityKey;
  
  // Driver Types Logic
  const hasDriverTypesConfig = !!cityConfig?.allowedDriverTypes;
  const showParticular = hasDriverTypesConfig ? !!cityConfig.allowedDriverTypes.particular : !isMunicipalStrict;
  const showTaxi = hasDriverTypesConfig ? !!cityConfig.allowedDriverTypes.taxi : true;
  const showRemis = hasDriverTypesConfig ? !!cityConfig.allowedDriverTypes.remis : !isMunicipalStrict;
  const showFleet = hasDriverTypesConfig ? !!cityConfig.allowedDriverTypes.fleet_driver : !isMunicipalStrict;

  const nextStep = () => {
    // Validation
    if (currentStep === 1) {
      if (!formData.name || !formData.dni || !formData.phone || !formData.cityKey) {
        return toast({ variant: 'destructive', title: 'Campos incompletos', description: 'Por favor completá todos los datos personales y seleccioná tu ciudad.' });
      }
    }
    if (currentStep === 2) {
      const year = parseInt(formData.year, 10);
      const currentYear = new Date().getFullYear();
      if (!formData.brand || !formData.model || !formData.plate || !formData.color || !formData.year) {
        return toast({ variant: 'destructive', title: 'Campos incompletos', description: 'Por favor completá los datos del vehículo.' });
      }
      if (isNaN(year) || year < 2011 || year > currentYear + 1) {
        return toast({ variant: 'destructive', title: 'Año inválido', description: 'Por ahora VamO acepta vehículos modelo 2011 en adelante.' });
      }
    }

    if (currentStep === 3) {
      // Step 3 is now "Tipo de Conductor"
      if (!formData.driverSubtype) {
          return toast({ variant: 'destructive', title: 'Requerido', description: 'Por favor seleccioná un tipo de conductor.' });
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
      // 1. Upload profile photo if provided
      let photoURL = null;
      if (docs.profilePhoto) {
        try {
            console.log("[ONBOARDING_WRITE] Uploading profile photo...");
            const uploadResult = await uploadFile(docs.profilePhoto, 'profilePhoto');
            photoURL = uploadResult.url;
        } catch (err) {
            console.error("Error uploading profile photo:", err);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir la foto de perfil, pero el registro continuará.' });
        }
      }

      console.log("[DRIVER_ONBOARDING_CALLABLE_START] Calling completeDriverOnboardingV1...");
      const completeDriverOnboarding = httpsCallable(functions!, 'completeDriverOnboardingV1');
      
      let finalCityKey = canonicalCityKey(formData.cityKey);
      let finalCityLabel = CITIES[formData.cityKey]?.name || formData.cityKey;
      let cityResolutionStatus = formData.cityResolutionStatus;
      let cityResolutionSource = formData.cityResolutionSource;

      // Resolve manual customCity if 'other'
      if (!finalCityKey && formData.customCity) {
          const manualCity = formData.customCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          let foundKey = '';
          let resolvedName = '';
          for (const c of availableCities) {
              const cityMatchName = c.name?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || '';
              if (cityMatchName && manualCity.includes(cityMatchName)) {
                  foundKey = c.cityKey || c.id;
                  resolvedName = c.name;
                  break;
              }
              if (c.aliases && Array.isArray(c.aliases)) {
                  const aliasMatch = c.aliases.some((alias: string) => manualCity.includes(alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                  if (aliasMatch) {
                      foundKey = c.cityKey || c.id;
                      resolvedName = c.name;
                      break;
                  }
              }
          }
          if (foundKey) {
              finalCityKey = foundKey;
              finalCityLabel = resolvedName;
              cityResolutionStatus = 'resolved';
              cityResolutionSource = 'manual';
          } else {
              finalCityKey = '';
              finalCityLabel = formData.customCity;
              cityResolutionSource = 'manual';
          }
      } else if (finalCityKey !== 'other' && finalCityKey !== '') {
         // Resolve from CITIES or availableCities
         const c = availableCities.find(c => c.cityKey === finalCityKey || c.id === finalCityKey);
         if (c) {
             finalCityLabel = c.name;
             cityResolutionStatus = 'resolved';
         }
      }

      if (finalCityKey === 'other' || !finalCityKey) {
         cityResolutionStatus = 'outside_service_area';
         finalCityKey = '';
      }

      const payload: any = {
        name: formData.name,
        dni: formData.dni,
        phone: formData.phone.replace(/[\s\-\+()]/g, ''),
        photoURL,
        vehicle: {
          brand: formData.brand,
          model: formData.model,
          year: parseInt(formData.year, 10),
          plate: formData.plate.toUpperCase().trim(),
          color: formData.color,
        },
        plateNumber: formData.plate.toUpperCase().trim(),
        carModelYear: parseInt(formData.year, 10),
        cityKey: finalCityKey,
        registrationCityKey,
        cityLabel: finalCityLabel,
        cityResolutionStatus,
        cityResolutionSource,
        registrationLocation: formData.registrationLocation,
        driverSubtype: formData.driverSubtype,
        commissionRate: 0.18, // Forzado Plan B
        termsAccepted: true,
        driverTermsAccepted: true,
        acceptedDriverTerms: true,
        termsVersion: CURRENT_TERMS_VERSION, // Consistent with legal-config
        legalType: 'driver_contract',
        legalName: formData.legalName,
        legalDni: formData.legalDni,
      };

      await completeDriverOnboarding(payload);

      console.log("[DRIVER_ONBOARDING_CALLABLE_OK] Success.");
      console.log("[DRIVER_ONBOARDING_STATUS_PENDING_REVIEW] municipalStatus set to pending_municipal_review");
      console.log("[DRIVER_ONBOARDING_REDIRECT_STATUS] Preparing to show success modal.");

      // [VamO SAFETY] Signal to AuthGuard that onboarding just completed.
      // This prevents a false redirect to /driver/login if Firebase Auth
      // re-hydration is slower than the guard evaluation on next page load.
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('driverOnboardingJustCompleted', 'true');
      }

      if (payload.cityResolutionStatus === 'outside_service_area') {
         toast({
           title: 'Lista de espera',
           description: 'Todavía no tenemos habilitada tu zona. Dejá tus datos y te avisamos cuando VamO esté disponible en tu localidad.',
         });
      } else {
         toast({
           title: '¡Registro completo!',
           description: 'Tu perfil ha sido enviado para revisión municipal.',
         });
      }

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

                    <div className="space-y-2 pt-2">
                        <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-2 block">Foto de Perfil (Opcional pero recomendada)</Label>
                        <div className="flex items-center gap-4">
                            {previews.profilePhoto ? (
                                <img src={previews.profilePhoto} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                    <Camera className="w-6 h-6 text-zinc-500" />
                                </div>
                            )}
                            <div className="flex-1 relative">
                                <Input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={(e) => handleFileChange(e, 'profilePhoto')} 
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" 
                                />
                                <Button type="button" variant="outline" className="w-full bg-white/5 border-white/10 text-xs">
                                    {docs.profilePhoto ? 'Cambiar Foto' : 'Subir Foto'}
                                </Button>
                            </div>
                        </div>
                    </div>                    
                    
                    {/* Ciudad: Selección y Ubicación actual */}
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-400 block mb-1">Hub Operativo</Label>
                      <CityHubAutocomplete
                          value={formData.cityKey}
                          onChange={(key, city) => {
                              setFormData(p => ({ 
                                  ...p, 
                                  cityKey: canonicalCityKey(key),
                                  cityResolutionSource: 'manual',
                                  cityResolutionStatus: 'resolved'
                              }));
                          }}
                          disabled={isLocating}
                      />
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                           {formData.cityResolutionSource === 'gps' ? 'Ciudad sugerida por GPS' : formData.cityResolutionSource === 'manual' ? 'Selección manual' : ''}
                        </span>
                        <button 
                            type="button" 
                            onClick={getCurrentLocation} 
                            disabled={isLocating} 
                            className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            {isLocating ? 'Buscando...' : 'Autodetectar con GPS'}
                        </button>
                      </div>
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

                    <div className="space-y-2 pt-2">
                        {/* Vehicle photo upload removed */}
                    </div>
                  </div>
                )}

                {/* --- STEP 3: TYPE --- */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-400 mb-4">Seleccioná cómo vas a trabajar. Esto define tu comisión y beneficios.</p>
                    <div className="grid grid-cols-1 gap-4">
                      
                      {showParticular && (
                            <button
                              type="button"
                              onClick={() => setFormData(p => ({ ...p, driverSubtype: 'particular' }))}
                              className={cn(
                                "p-6 rounded-3xl border text-left transition-all",
                                formData.driverSubtype === 'particular' || formData.driverSubtype === 'express'
                                  ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                                  : "bg-white/5 border-white/5 hover:bg-white/10"
                              )}
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-lg font-black uppercase italic tracking-tighter">Particular</span>
                                {(formData.driverSubtype === 'particular' || formData.driverSubtype === 'express') && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                              </div>
                              <p className="text-xs text-zinc-500 leading-relaxed font-medium">Vehículo propio. Operás como conductor particular dentro de VamO.</p>
                            </button>
                          )}

                      {showTaxi && (
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, driverSubtype: 'taxi' }))}
                          className={cn(
                            "p-6 rounded-3xl border text-left transition-all",
                            formData.driverSubtype === 'taxi' || formData.driverSubtype === 'professional'
                              ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-lg font-black uppercase italic tracking-tighter">Taxi</span>
                            {(formData.driverSubtype === 'taxi' || formData.driverSubtype === 'professional') && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                          </div>
                          <p className="text-xs text-zinc-500 leading-relaxed font-medium">Taxi habilitado por el municipio.</p>
                        </button>
                      )}

                      {showRemis && (
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, driverSubtype: 'remis' }))}
                          className={cn(
                            "p-6 rounded-3xl border text-left transition-all",
                            formData.driverSubtype === 'remis' 
                              ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-lg font-black uppercase italic tracking-tighter">Remís</span>
                            {formData.driverSubtype === 'remis' && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                          </div>
                          <p className="text-xs text-zinc-500 leading-relaxed font-medium">Remís habilitado por el municipio.</p>
                        </button>
                      )}

                      {showFleet && (
                        <div className={cn(
                            "p-6 rounded-3xl border text-left transition-all",
                            formData.driverSubtype === 'fleet_driver' 
                              ? "bg-indigo-600/10 border-indigo-600 ring-2 ring-indigo-600/20" 
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}>
                            <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => setFormData(p => ({ ...p, driverSubtype: 'fleet_driver' }))}
                            >
                                <div className="flex justify-between items-center mb-2">
                                <span className="text-lg font-black uppercase italic tracking-tighter">Chofer Vinculado a Flota</span>
                                {formData.driverSubtype === 'fleet_driver' && <VamoIcon name="check-circle" className="w-6 h-6 text-indigo-400" />}
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed font-medium">Manejás un vehículo de otro propietario o flota.</p>
                            </button>
                            {formData.driverSubtype === 'fleet_driver' && (
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase tracking-widest text-zinc-400">Patente o DNI del Propietario</Label>
                                        <Input 
                                            name="fleetOwnerId" 
                                            value={(formData as any).fleetOwnerId || ''} 
                                            onChange={handleInputChange} 
                                            placeholder="AB123CD o 12345678"
                                            className="h-12 bg-zinc-950/50 border-white/10 text-white" 
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-500 italic">El propietario deberá aprobar tu vinculación más adelante.</p>
                                </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                    
                {/* --- STEP 4: FINISH --- */}
                {currentStep === 4 && (
                  <div className="text-center space-y-6 py-8">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto border border-emerald-500/30">
                      <VamoIcon name="check-circle" className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase tracking-tighter italic">¡Todo listo!</h3>
                      <p className="text-zinc-500 text-sm max-w-xs mx-auto">Al finalizar, enviaremos tus datos para la creación de tu cuenta.</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-white/5 text-left space-y-2">
                        <div className="flex justify-between text-[11px] uppercase tracking-widest font-black text-zinc-500">
                            <span>Resumen de Registro</span>
                            <span className="text-indigo-400">
                                {formData.driverSubtype === 'taxi' ? 'Taxi' : 
                                 formData.driverSubtype === 'remis' ? 'Remís' : 
                                 formData.driverSubtype === 'fleet_driver' ? 'Chofer Vinculado' : 
                                 formData.driverSubtype === 'professional' ? 'Taxi / Remís' : 'Particular'}
                            </span>
                        </div>
                        <div className="text-sm font-medium">
                            <p>{formData.name}</p>
                            <p className="text-zinc-400">{formData.brand} {formData.model} {formData.year} • {formData.color}</p>
                            <p className="text-zinc-400 font-mono tracking-widest text-xs mt-1">PATENTE: {formData.plate}</p>
                        </div>
                    </div>

                    <div className="pt-4 flex flex-col items-center gap-4 text-left border-t border-white/5 mt-4">
                        <Button
                            onClick={() => setIsLegalModalOpen(true)}
                            variant="outline"
                            className={cn(
                                "w-full h-14 rounded-2xl font-black uppercase tracking-widest transition-all",
                                formData.termsAccepted 
                                  ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400" 
                                  : "border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                            )}
                        >
                            {formData.termsAccepted ? "Contrato Firmado" : "Leer y Firmar Contrato"}
                        </Button>
                        <p className="text-[11px] text-zinc-500 leading-tight text-center max-w-xs">
                            Debés leer íntegramente y firmar el contrato digital para poder operar en VamO.
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
                  disabled={loading || (currentStep === STEPS.length && !formData.termsAccepted)}
                  className={cn(
                    "flex-1 h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95",
                    currentStep === STEPS.length ? "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50" : "bg-indigo-600 hover:bg-indigo-700"
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
                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">¡Cuenta Creada!</h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Cuenta creada correctamente. Ahora completá tu habilitación desde la pestaña Habilitación.
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

        <Dialog open={isLegalModalOpen} onOpenChange={setIsLegalModalOpen}>
            <DialogContent 
                className="max-w-md w-[95vw] h-[85vh] flex flex-col gap-0 sm:rounded-[2.5rem] overflow-hidden bg-zinc-950 border-white/5 shadow-2xl p-0"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="p-8 border-b border-white/5 bg-zinc-900/50 shrink-0 text-left relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Scale className="h-32 w-32 text-indigo-500 -mr-12 -mt-12 rotate-12" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
                                <Scale className="h-5 w-5 text-indigo-400" />
                            </div>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Contrato Conductor VamO</span>
                        </div>
                        <div>
                            <DialogTitle className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                                Acuerdo Operativo
                            </DialogTitle>
                            <DialogDescription className="text-xs text-zinc-500 font-medium">
                                Versión {CURRENT_TERMS_VERSION} | Actualización {new Date().getFullYear()}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-8 text-sm text-zinc-400 space-y-8 leading-relaxed custom-scrollbar relative">
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-zinc-300 font-medium">
                            Este contrato rige tu relación como conductor independiente con VamO. Debés deslizar hasta el final para habilitar la firma digital.
                        </p>
                    </div>

                    <DriverSpecificTerms />
                    <LiabilityPolicyText />
                    <CancellationPolicyText />
                    <VerificationPolicyText />
                    <ScoringPolicyText />
                    <SuspensionPolicyText />
                    <PrivacyPolicyText />

                    <div className="pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 text-zinc-600">
                            <AlertCircle className="h-3 w-3" />
                            <p className="text-[10px] italic">Este contrato es vinculante y rige en la jurisdicción de la Provincia de Chubut, Argentina.</p>
                        </div>
                    </div>
                    
                    {/* Centinela de scroll */}
                    <div ref={sentinelRef} className="h-10 w-full" />
                </div>

                {hasScrolledToBottom && (
                    <div className="p-6 sm:p-8 pb-10 bg-zinc-900 border-t border-white/5 shrink-0 flex flex-col gap-4 animate-in slide-in-from-bottom-8 fade-in duration-500">
                        <div className="space-y-3 mb-2">
                            <Input 
                                placeholder="Nombre completo" 
                                value={formData.legalName}
                                onChange={(e) => setFormData(p => ({ ...p, legalName: e.target.value }))}
                                className="h-12 bg-zinc-950 border-white/10"
                            />
                            <Input 
                                placeholder="DNI" 
                                type="number"
                                value={formData.legalDni}
                                onChange={(e) => setFormData(p => ({ ...p, legalDni: e.target.value }))}
                                className="h-12 bg-zinc-950 border-white/10"
                            />
                        </div>
                        <div className="transition-opacity duration-300 opacity-100">
                            <label className="flex items-start gap-3 px-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    required
                                    checked={formData.termsAccepted} 
                                    onChange={e => setFormData(p => ({ ...p, termsAccepted: e.target.checked }))} 
                                    className="mt-0.5 h-4 w-4 rounded border-white/10 bg-zinc-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" 
                                />
                                <p className="text-[10px] text-zinc-400 leading-tight group-hover:text-zinc-300">
                                    En carácter de declaración jurada, firmo digitalmente y acepto íntegramente este contrato operativo.
                                </p>
                            </label>
                        </div>
                        <Button 
                            onClick={() => setIsLegalModalOpen(false)}
                            disabled={!formData.termsAccepted || formData.legalName.length < 5 || formData.legalDni.length < 7}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-[0.98] mb-2 sm:mb-0"
                        >
                            Aceptar y Continuar
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>

        <style jsx global>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
        `}</style>

        {/* Support Link */}
        <p className="text-center text-xs text-zinc-500">
            ¿Necesitás ayuda? <a href="mailto:soporte.vamo@gmail.com" className="text-indigo-400 hover:underline">Contactar a soporte</a>
        </p>
      </div>
    </div>
  );
}
