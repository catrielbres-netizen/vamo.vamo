// src/app/driver/earnings/page.tsx
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { useUser } from '@/firebase';
import { collection, doc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { redirect } from 'next/navigation';
import { PaymentIntent } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import EarningsClientPage from './EarningsClientPage';

// Initialize Firebase to get Firestore instance
// This needs to be done at the top level for Server Actions
const { firestore } = initializeFirebase();

async function createPreference(formData: FormData) {
    'use server';

    const rawAmount = formData.get('amount');
    const driverId = formData.get('driverId') as string;
    const amount = Number(rawAmount);

    if (![5000, 10000, 20000].includes(amount)) {
        throw new Error('Monto de recarga inválido.');
    }
    if (!driverId) {
        throw new Error('ID de conductor no encontrado.');
    }
    
    // --- PASO 2: Crear Preference (Backend) ---
    // 1. Crear documento en `payment_intents`
    const intentRef = collection(firestore, "payment_intents");
    const newIntent: Omit<PaymentIntent, 'id'> = {
        driverId,
        amount,
        status: "pending",
        createdAt: serverTimestamp(),
    };
    const intentDoc = await addDoc(intentRef, newIntent);

    // 2. Crear preferencia en Mercado Pago
    const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! 
    });
    const preference = new Preference(client);

    const preferenceResponse = await preference.create({
        body: {
            items: [
                {
                    id: intentDoc.id,
                    title: `Carga de saldo VamO por ${amount}`,
                    quantity: 1,
                    unit_price: amount,
                    currency_id: 'ARS',
                },
            ],
            external_reference: intentDoc.id, // 🔐 Clave contable
            back_urls: {
                success: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=success`,
                failure: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=failure`,
                pending: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=pending`,
            },
            auto_return: 'approved',
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
        },
    });

    // 3. Guardar el ID de la preferencia en nuestro intent
    await updateDoc(doc(firestore, "payment_intents", intentDoc.id), {
        mpPreferenceId: preferenceResponse.id,
    });
    
    // 4. Devolver `init_point` y redirigir
    if (preferenceResponse.init_point) {
        redirect(preferenceResponse.init_point);
    } else {
        throw new Error("No se pudo crear el punto de pago de Mercado Pago.");
    }
}

export default async function EarningsPage() {
    // This is now a Server Component, so we fetch data directly
    // Note: The `useUser` hook can't be used in Server Components directly.
    // We'll pass the necessary data to the client component.

    return (
        <EarningsClientPage createPreferenceAction={createPreference} />
    );
}
