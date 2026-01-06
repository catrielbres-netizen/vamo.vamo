
// src/app/driver/earnings/page.tsx
'use server';

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';

import { PaymentIntent } from '@/lib/types';
import EarningsClientPage from './EarningsClientPage';
import { getFirebaseAdminApp } from '@/lib/server/firebase-admin';

// Initialize Firebase Admin SDK
const { db } = getFirebaseAdminApp();

// Configure Mercado Pago SDK
// Ensure MERCADOPAGO_ACCESS_TOKEN is set in your environment variables
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});


async function createPreferenceAction(formData: FormData) {
    'use server';

    const rawAmount = formData.get('amount');
    const driverId = formData.get('driverId') as string;
    const amount = Number(rawAmount);

    if (![5000, 10000, 20000].includes(amount) || !driverId) {
        throw new Error('Datos de pago inválidos.');
    }
    
    if (!db) {
        throw new Error('La conexión con la base de datos no está disponible. Verifique la configuración del servidor.');
    }

    // --- PASO 1: Crear nuestro `payment_intent` interno ---
    const intentRef = db.collection("payment_intents").doc();
    const newIntent: Omit<PaymentIntent, 'id' | 'createdAt'> & { createdAt: FieldValue } = {
        driverId,
        amount,
        status: "pending",
        provider: "mercadopago",
        createdAt: FieldValue.serverTimestamp(),
    };
    await intentRef.set(newIntent);


    // --- PASO 2: Crear la preferencia en Mercado Pago ---
    const preference = new Preference(client);
    const preferenceResponse = await preference.create({
        body: {
            items: [
                {
                    id: intentRef.id,
                    title: `Carga de saldo VamO por ${amount}`,
                    quantity: 1,
                    unit_price: amount,
                    currency_id: 'ARS',
                },
            ],
            // 🔐 external_reference es la clave que vincula el pago de MP con nuestro sistema
            external_reference: `payment_intent:${intentRef.id}`, 
            back_urls: {
                success: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=success`,
                failure: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=failure`,
                pending: `${process.env.NEXT_PUBLIC_APP_URL}/driver/earnings?mp_status=pending`,
            },
            auto_return: 'approved',
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
        },
    });

    // --- PASO 3: Guardar el ID de la preferencia en nuestro `payment_intent` ---
    await intentRef.update({
        mpPreferenceId: preferenceResponse.id,
        updatedAt: FieldValue.serverTimestamp(),
    });
    
    revalidatePath('/driver/earnings');

    // --- PASO 4: Redirigir al conductor al checkout ---
    if (preferenceResponse.init_point) {
        redirect(preferenceResponse.init_point);
    } else {
        throw new Error("No se pudo crear el punto de pago de Mercado Pago.");
    }
}

export default async function EarningsPage() {
    return (
        <EarningsClientPage createPreferenceAction={createPreferenceAction} />
    );
}
