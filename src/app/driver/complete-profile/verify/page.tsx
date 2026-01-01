
'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsAppLogo } from '@/components/icons';
import { Check, FileText, Shield, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

export default function VerifyPage() {
    const adminWhatsAppNumber = "2804967673";
    const router = useRouter();
    const { profile, loading } = useUser();

    // The message is now constructed dynamically
    const createWhatsAppMessage = () => {
        if (loading || !profile) {
            return 'Hola, soy un nuevo conductor de VamO y quiero verificar mi cuenta.';
        }

        const fullName = `${profile.name || ''} ${profile.lastName || ''}`.trim();

        const baseText = `
Hola, soy un nuevo conductor de VamO. Quiero verificar mi cuenta.
-----------------------------------
*Mis Datos:*
*Nombre:* ${fullName}
*Email:* ${profile.email}
-----------------------------------
Adjunto mi documentación:
- Foto de DNI (frente y dorso)
- Foto de Licencia de Conducir (frente y dorso)
- Foto del Seguro del Vehículo vigente
- Foto de la Cédula del Vehículo (para verificar el modelo)

Gracias.
        `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');
        
        return baseText;
    };


    const handleWhatsAppClick = () => {
        const message = createWhatsAppMessage();
        const url = `https://wa.me/${adminWhatsAppNumber}?text=${message}`;
        window.open(url, '_blank');
    };
    
    const handleLogout = () => {
        // Here you would typically sign the user out
        router.push('/login');
    };

    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                    <CardTitle>¡Ya casi estás listo!</CardTitle>
                    <CardDescription>Solo falta un paso para activar tu cuenta.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-secondary rounded-lg space-y-3">
                        <p className="font-semibold text-center">Envíanos por WhatsApp la siguiente documentación:</p>
                        <ul className="text-sm space-y-2">
                            <li className="flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Foto de tu DNI (frente y dorso).</li>
                            <li className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Foto de tu Licencia de Conducir.</li>
                            <li className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Foto del Seguro de tu vehículo.</li>
                            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" /> Comprobante del modelo del auto.</li>
                        </ul>
                    </div>

                    <Button onClick={handleWhatsAppClick} className="w-full" size="lg" disabled={loading}>
                        <WhatsAppLogo className="mr-2 h-5 w-5" />
                        {loading ? 'Cargando datos...' : 'Enviar Documentación por WhatsApp'}
                    </Button>
                    
                    <div className="text-center text-sm text-muted-foreground pt-4">
                        <p>Nuestro equipo revisará tus documentos y recibirás una notificación cuando tu cuenta sea aprobada.</p>
                        <p className="font-semibold">Esto puede demorar hasta 24hs.</p>
                    </div>

                </CardContent>
                 <CardContent>
                    <Button onClick={handleLogout} variant="outline" className="w-full">
                       Entendido, cerrar sesión
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
