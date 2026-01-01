'use server';
/**
 * @fileOverview Flow to analyze a driver's recent rides for fraudulent patterns.
 *
 * - analyzeDriverRides: Analyzes ride data and returns a summary.
 * - AnalyzeDriverRidesInput: The input type for the function.
 * - AnalyzeDriverRidesOutput: The output type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { Ride } from '@/lib/types';

// Server-side Firebase initialization
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const firestore = getFirestore(firebaseApp);

const AnalyzeDriverRidesInputSchema = z.object({
  driverId: z.string().describe('The unique ID of the driver to analyze.'),
});
export type AnalyzeDriverRidesInput = z.infer<typeof AnalyzeDriverRidesInputSchema>;

const AnalyzeDriverRidesOutputSchema = z.object({
    analysis: z.string().describe('A summary of the analysis of the driver\'s ride history, highlighting any suspicious patterns.'),
});
export type AnalyzeDriverRidesOutput = z.infer<typeof AnalyzeDriverRidesOutputSchema>;

export async function analyzeDriverRides(input: AnalyzeDriverRidesInput): Promise<AnalyzeDriverRidesOutput> {
  return analyzeDriverRidesFlow(input);
}

const analysisPrompt = ai.definePrompt({
    name: 'analyzeDriverRidesPrompt',
    input: { schema: z.object({ driverId: z.string(), ridesJson: z.string() }) },
    output: { schema: AnalyzeDriverRidesOutputSchema },
    prompt: `You are an expert fraud analyst for a ride-sharing app called VamO.
    Your task is to analyze a driver's recent ride history to identify patterns of potential fraud.

    Here is the recent ride history for driver {{{driverId}}} in JSON format:
    {{{ridesJson}}}

    Analyze the data and look for the following suspicious patterns:
    1.  **High Volume of Very Short Rides**: Many rides with a duration under 2 minutes or a distance under 300 meters. This can indicate collusion or fake trips to farm bonuses.
    2.  **Repetitive Routes**: Multiple trips between the same two obscure points, especially if they are short.
    3.  **Anomalous Pricing**: Rides where the final price is significantly disconnected from the distance and duration.
    4.  **Geographic Clustering**: All rides concentrated in a very small, unusual area.
    5.  **No Pauses or Waits**: A long history of rides with zero waiting time might be suspicious, but is a weak signal on its own.

    Based on your analysis, provide a concise summary.
    - If you find suspicious patterns, start with "⚠️ COMPORTAMIENTO SOSPECHOSO DETECTADO:" and list the specific patterns you found with brief examples.
    - If the ride history appears normal and consistent with legitimate use, start with "✅ COMPORTAMIENTO NORMAL:" and state that no anomalies were found.

    Be clear, concise, and direct. Your audience is a platform administrator.
    `,
});


const analyzeDriverRidesFlow = ai.defineFlow(
  {
    name: 'analyzeDriverRidesFlow',
    inputSchema: AnalyzeDriverRidesInputSchema,
    outputSchema: AnalyzeDriverRidesOutputSchema,
  },
  async ({ driverId }) => {

    // 1. Fetch the last 30 rides for the driver
    const ridesRef = collection(firestore, 'rides');
    const q = query(
        ridesRef, 
        where('driverId', '==', driverId),
        where('status', '==', 'finished'),
        orderBy('createdAt', 'desc'),
        limit(30)
    );
    
    let rides: Ride[] = [];
    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return { analysis: "✅ COMPORTAMIENTO NORMAL: No se encontraron viajes completados recientes para este conductor." };
        }
        querySnapshot.forEach(doc => {
            rides.push(doc.data() as Ride);
        });
    } catch (error) {
        console.error("Failed to fetch rides for analysis:", error);
        throw new Error(`Failed to fetch rides for driver ${driverId}`);
    }

    // 2. Serialize the data for the prompt
    // We select only the most relevant fields to keep the prompt clean and focused.
    const simplifiedRides = rides.map(r => ({
        origin: r.origin.address,
        destination: r.destination.address,
        distanceMeters: r.pricing.estimatedDistanceMeters,
        durationSeconds: r.pricing.estimatedDurationSeconds,
        finalTotal: r.pricing.finalTotal,
    }));
    
    const ridesJson = JSON.stringify(simplifiedRides, null, 2);

    // 3. Call the AI model for analysis
    const { output } = await analysisPrompt({ driverId, ridesJson });
    
    if (!output) {
      throw new Error("The AI model did not return a valid analysis.");
    }
    
    return { analysis: output.analysis };
  }
);
