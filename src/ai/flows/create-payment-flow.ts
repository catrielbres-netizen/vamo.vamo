'use server';
/**
 * @fileOverview Flow para crear una preferencia de pago en Mercado Pago.
 *
 * - createPaymentPreference: Crea y devuelve una preferencia de pago.
 * - CreatePaymentPreferenceInput: El tipo de entrada para la función.
 * - CreatePaymentPreferenceOutput: El tipo de retorno para la función.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { MercadoPagoConfig, Preference } from 'mercadopago';

// Agregá tu Access Token de Mercado Pago en un archivo .env.local
// NUNCA lo subas a tu repositorio de código.
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
const preference = new Preference(client);

const CreatePaymentPreferenceInputSchema = z.object({
  summaryId: z.string().describe('El ID del resumen de conductor a pagar.'),
  amount: z.number().describe('El monto a pagar.'),
  description: z.string().describe('Descripción del pago.'),
});
export type CreatePaymentPreferenceInput = z.infer<typeof CreatePaymentPreferenceInputSchema>;

const CreatePaymentPreferenceOutputSchema = z.object({
  preferenceId: z.string().describe('El ID de la preferencia de pago creada.'),
  redirectUrl: z.string().describe('La URL a la que redirigir al usuario para pagar.'),
});
export type CreatePaymentPreferenceOutput = z.infer<typeof CreatePaymentPreferenceOutputSchema>;

export async function createPaymentPreference(input: CreatePaymentPreferenceInput): Promise<CreatePaymentPreferenceOutput> {
  return createPaymentPreferenceFlow(input);
}


const createPaymentPreferenceFlow = ai.defineFlow(
  {
    name: 'createPaymentPreferenceFlow',
    inputSchema: CreatePaymentPreferenceInputSchema,
    outputSchema: CreatePaymentPreferenceOutputSchema,
  },
  async (input) => {
    // La URL base debe ser la de tu aplicación deployada
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

    try {
      const result = await preference.create({
        body: {
          items: [
            {
              id: input.summaryId,
              title: input.description,
              quantity: 1,
              unit_price: input.amount,
              currency_id: 'ARS',
            },
          ],
          back_urls: {
            success: `${baseUrl}/payment/success?summary_id=${input.summaryId}`,
            failure: `${baseUrl}/payment/failure?summary_id=${input.summaryId}`,
            pending: `${baseUrl}/payment/pending?summary_id=${input.summaryId}`,
          },
          auto_return: 'approved',
          external_reference: input.summaryId, // Referencia para el webhook
        },
      });

      if (!result.id || !result.init_point) {
        throw new Error('La respuesta de Mercado Pago no fue la esperada.');
      }
      
      return {
        preferenceId: result.id,
        redirectUrl: result.init_point,
      };

    } catch (error: any) {
      console.error('Error al crear preferencia de Mercado Pago:', error.cause?.data || error.message);
      // Re-lanzamos el error para que Genkit lo maneje
      throw new Error(`Error de Mercado Pago: ${error.message}`);
    }
  }
);
