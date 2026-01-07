// src/app/driver/earnings/page.tsx

export const dynamic = "force-dynamic";

import EarningsClientPage from './EarningsClientPage';
import { getFirebaseAdminApp } from '@/lib/server/firebase-admin';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { redirect } from 'next/navigation';
import { Timestamp } from 'firebase-admin/firestore';
import { PaymentIntent } from '@/lib/types';


export default async function DriverEarningsPage() {

  async function createPreferenceAction(formData: FormData) {
    'use server';
    const amount = Number(formData.get('amount'));
    const driverId = formData.get('driverId') as string;

    if (!amount || !driverId) {
      throw new Error('Monto y ID de conductor son requeridos.');
    }
    
    const { db } = getFirebaseAdminApp();
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!db || !accessToken || !appUrl) {
      console.error("Server misconfiguration: missing DB, MP token, or App URL");
      throw new Error('Error del servidor al procesar el pago.');
    }

    // 1. Create a payment intent in our database
    const paymentIntentRef = db.collection('payment_intents').doc();
    const intent: PaymentIntent = {
      driverId,
      amount,
      status: 'pending',
      provider: 'mercadopago',
      createdAt: Timestamp.now(),
    };
    await paymentIntentRef.set(intent);

    // 2. Create the MercadoPago preference
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: paymentIntentRef.id,
            title: `Carga de Saldo VamO`,
            quantity: 1,
            unit_price: amount,
            currency_id: 'ARS',
          },
        ],
        external_reference: `payment_intent:${paymentIntentRef.id}`,
        notification_url: `${appUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${appUrl}/driver/earnings?mp_status=success`,
          failure: `${appUrl}/driver/earnings?mp_status=failure`,
          pending: `${appUrl}/driver/earnings?mp_status=pending`,
        },
        auto_return: 'approved',
      },
    });

    if (!result.id) {
      await paymentIntentRef.update({ status: 'rejected', note: 'Failed to get preference ID from MP' });
      throw new Error('No se pudo crear la preferencia de pago en Mercado Pago.');
    }

    // 3. Update our intent with the preference ID
    await paymentIntentRef.update({ mpPreferenceId: result.id });
    
    // 4. Redirect the user to MercadoPago checkout
    if (result.init_point) {
      redirect(result.init_point);
    } else {
        throw new Error('No se pudo obtener el punto de inicio de pago de Mercado Pago.');
    }
  }

  return (
    <div className="space-y-6">
      <EarningsClientPage createPreferenceAction={createPreferenceAction} />
    </div>
  );
}
