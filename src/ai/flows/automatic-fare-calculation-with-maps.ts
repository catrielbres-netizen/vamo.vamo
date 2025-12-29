'use server';
/**
 * @fileOverview This file defines a Genkit flow for calculating ride fares automatically using distance from a maps API.
 *
 * - automaticFareCalculationWithMaps - A function that calculates the fare.
 * - AutomaticFareCalculationWithMapsInput - The input type for the automaticFareCalculationWithMaps function.
 * - AutomaticFareCalculationWithMapsOutput - The return type for the automaticFareCalculationWithMaps function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AutomaticFareCalculationWithMapsInputSchema = z.object({
  origin: z.string().describe('The starting location of the ride.'),
  destination: z.string().describe('The destination of the ride.'),
  serviceType: z.enum(['Premium', 'Privado', 'Express']).describe('The type of service requested.'),
  isNightTime: z.boolean().describe('Whether the ride is taking place at night.'),
});
export type AutomaticFareCalculationWithMapsInput = z.infer<typeof AutomaticFareCalculationWithMapsInputSchema>;

const AutomaticFareCalculationWithMapsOutputSchema = z.object({
  fare: z.number().describe('The calculated fare for the ride.'),
  distanceMeters: z.number().describe('The distance in meters between origin and destination.'),
  estimatedTimeMinutes: z.number().describe('The estimated time in minutes for the ride.'),
});
export type AutomaticFareCalculationWithMapsOutput = z.infer<typeof AutomaticFareCalculationWithMapsOutputSchema>;

export async function automaticFareCalculationWithMaps(input: AutomaticFareCalculationWithMapsInput): Promise<AutomaticFareCalculationWithMapsOutput> {
  return automaticFareCalculationWithMapsFlow(input);
}

const mapsDistanceTool = ai.defineTool({
  name: 'getDistance',
  description: 'Calculates the distance and estimated travel time between two locations using a maps API.',
  inputSchema: z.object({
    origin: z.string().describe('The starting location.'),
    destination: z.string().describe('The destination location.'),
  }),
  outputSchema: z.object({
    distanceMeters: z.number().describe('The distance in meters.'),
    estimatedTimeMinutes: z.number().describe('The estimated time in minutes.'),
  }),
}, async (input) => {
  // Placeholder implementation for distance calculation.
  // In a real application, this would call a maps API.
  // For testing purposes, we'll return some dummy values.
  console.log("Maps tool called with: ", input)
  return {
    distanceMeters: 5000, // Example distance: 5000 meters
    estimatedTimeMinutes: 10, // Example time: 10 minutes
  };
});

const fareCalculationPrompt = ai.definePrompt({
  name: 'fareCalculationPrompt',
  input: {schema: AutomaticFareCalculationWithMapsInputSchema},
  output: {schema: AutomaticFareCalculationWithMapsOutputSchema},
  tools: [mapsDistanceTool],
  prompt: `You are an expert fare calculator for a ride-sharing app called VamO. Calculate the fare based on the following information:

Service Type: {{{serviceType}}}
Origin: {{{origin}}}
Destination: {{{destination}}}
Is Night Time: {{{isNightTime}}}

First, use the getDistance tool to calculate the distance and estimated time between the origin and destination.

Then, use the following formulas to calculate the fare:

tarifa_base = 1400 // Premium bajada de bandera
tarifa_recorrido = distance_meters / 100 * 120
tarifa_espera = estimated_time_minutes * 100
tarifa_total = tarifa_base + tarifa_recorrido + tarifa_espera

Adjustments:
- Privado: 10% less than Premium.
- Express: 25% less than Premium.
- Nocturna: +5% on daytime fare.

Return the calculated fare, distance in meters, and estimated time in minutes in JSON format.
{
  "fare": 0,
  "distanceMeters": 0,
  "estimatedTimeMinutes": 0
}`,
});

const automaticFareCalculationWithMapsFlow = ai.defineFlow(
  {
    name: 'automaticFareCalculationWithMapsFlow',
    inputSchema: AutomaticFareCalculationWithMapsInputSchema,
    outputSchema: AutomaticFareCalculationWithMapsOutputSchema,
  },
  async input => {
    const distanceInfo = await mapsDistanceTool({
      origin: input.origin,
      destination: input.destination
    });

    const {distanceMeters, estimatedTimeMinutes} = distanceInfo

    const {output} = await fareCalculationPrompt({
      ...input,
      distanceMeters,
      estimatedTimeMinutes
    });

    let { fare } = output!;

    // Apply service type discount
    if (input.serviceType === 'Privado') {
      fare *= 0.9;
    } else if (input.serviceType === 'Express') {
      fare *= 0.75;
    }

    // Apply night time surcharge
    if (input.isNightTime) {
      fare *= 1.05;
    }

    output!.fare = fare

    return output!;
  }
);
