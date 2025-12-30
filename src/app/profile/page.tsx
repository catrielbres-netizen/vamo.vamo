
// src/app/profile/page.tsx
'use client';

import { useAuth, useDoc, useFirestore, useMemoFirebase, useUser, updateDocumentNonBlocking } from '@/firebase';
import { doc, getDocs, collection, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { UserProfile, Ride } from '@/lib/types';
import { LogOut, Star, Award, Percent, Info, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { WithId } from '@/firebase/firestore/use-collection';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';

const StatCard = ({ icon, label, value, bonus }: { icon: React.ReactNode, label: string, value: string | number, bonus?: boolean }) => (
    <div className={`p-4 rounded-lg flex items-center gap-4 ${bonus ? 'bg-green-100 dark:bg-green-900/50' : 'bg-secondary'}`}>
        <div className={`p-2 rounded-full ${bonus ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    </div>
);


export default function ProfilePage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const { user, isUserLoading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);


    const userProfileRef = useMemoFirebase(
        () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user]
    );
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

    const [recentRides, setRecentRides] = useState<WithId<Ride>[]>([]);

    useEffect(() => {
        if (!firestore || !user?.uid) return;

        const fetchRecentRides = async () => {
            const ridesQuery = query(
                collection(firestore, 'rides'),
                where('passengerId', '==', user.uid),
                where('status', '==', 'finished'),
                orderBy('finishedAt', 'desc'),
                limit(3)
            );
            const snapshot = await getDocs(ridesQuery);
            const rides = snapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
            setRecentRides(rides);
        }

        fetchRecentRides();

    }, [firestore, user?.uid]);

    const handleSignOut = async () => {
        if (auth) {
            await auth.signOut();
            router.push('/');
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && userProfileRef) {
            // In a real app, you would upload the file to Firebase Storage
            // and get a download URL. Here, we'll simulate it.
            const placeholderUrl = `https://picsum.photos/seed/${user?.uid}/200`;
            
            updateDocumentNonBlocking(userProfileRef, { photoURL: placeholderUrl });

            toast({
                title: 'Foto de perfil actualizada',
                description: 'Tu nueva foto de perfil ha sido guardada.',
            });
        }
    };


    if (isUserLoading || isProfileLoading) {
        return <div className="container mx-auto p-4 text-center">Cargando perfil...</div>;
    }

    if (!user) {
        return (
            <div className="container mx-auto p-4 text-center">
                <p>Necesitas iniciar sesión para ver tu perfil.</p>
                <Link href="/"><Button>Ir al Inicio</Button></Link>
            </div>
        );
    }
    
    const bonusActive = userProfile && userProfile.vamoPoints >= 30;

    return (
        <main className="container mx-auto max-w-md p-4">
            <Card>
                <CardHeader className="text-center items-center">
                    <div className="relative">
                        <Avatar className="w-24 h-24 text-lg" onClick={handleAvatarClick} >
                            <AvatarImage src={userProfile?.photoURL || user.photoURL || undefined} alt={userProfile?.name} />
                            <AvatarFallback>{userProfile?.name?.charAt(0) || 'P'}</AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 cursor-pointer hover:bg-primary/80">
                            <Edit2 className="w-4 h-4" />
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept="image/*"
                        />
                    </div>
                    <CardTitle className="text-2xl pt-4">
                        {userProfile?.name || user.displayName || 'Pasajero Anónimo'}
                    </CardTitle>
                    <CardDescription>
                        ¡Gracias por viajar con VamO!
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard icon={<Award className="w-5 h-5"/>} label="Vamo Puntos" value={userProfile?.vamoPoints ?? 0} />
                        <StatCard icon={<Star className="w-5 h-5"/>} label="Calificación" value={userProfile?.averageRating?.toFixed(1) || 'N/A'} />
                    </div>

                    {bonusActive && (
                       <div className="p-4 rounded-lg flex items-center gap-4 bg-primary/10 text-primary border border-primary/20">
                            <div className="p-2 rounded-full bg-primary text-primary-foreground">
                               <Percent className="w-5 h-5"/>
                            </div>
                            <div>
                                <p className="font-bold">¡Bono de 10% Desbloqueado!</p>
                                <p className="text-sm">Se aplicará en tu próximo viaje.</p>
                            </div>
                        </div>
                    )}
                    
                    <Separator />

                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1">
                            <AccordionTrigger>
                                <div className='flex items-center gap-2'><Award className='w-4 h-4' />¿Qué son los Vamo Puntos?</div>
                            </AccordionTrigger>
                            <AccordionContent className='text-muted-foreground text-sm'>
                            Ganá 3 Vamo Puntos por cada viaje que completes. Al juntar 30 puntos, ¡recibís un 10% de descuento en tu próximo viaje! Es nuestra forma de agradecerte por elegirnos.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-2">
                            <AccordionTrigger>
                                <div className='flex items-center gap-2'><Info className='w-4 h-4' />Acerca de VamO</div>
                            </AccordionTrigger>
                            <AccordionContent className='text-muted-foreground text-sm'>
                            VamO es una aplicación de viajes compartidos desarrollada para conectar pasajeros y conductores de manera eficiente y segura. Nuestra misión es ofrecer una alternativa de transporte confiable, económica y amigable en tu ciudad.
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>


                    <Separator />

                    <div>
                        <h3 className="text-lg font-semibold mb-2">Viajes Recientes</h3>
                        <div className="space-y-3">
                            {recentRides.length > 0 ? recentRides.map(ride => (
                                <div key={ride.id} className="p-3 bg-secondary rounded-lg text-sm">
                                    <p>Hacia: <strong>{ride.destination.address}</strong></p>
                                    <p className="text-xs text-muted-foreground">
                                        Finalizado el {ride.finishedAt instanceof Timestamp ? ride.finishedAt.toDate().toLocaleDateString('es-AR') : ''}
                                    </p>
                                </div>
                            )) : (
                                <p className="text-sm text-muted-foreground text-center">No hay viajes recientes.</p>
                            )}
                        </div>
                    </div>


                    <Separator />

                    <Button onClick={handleSignOut} variant="outline" className="w-full">
                        <LogOut className="mr-2 h-4 w-4" />
                        Cerrar Sesión
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
