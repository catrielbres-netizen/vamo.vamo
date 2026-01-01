'use server';
/**
 * @fileOverview Flow to audit a completed ride for potential fraud.
 *
 * - auditRide: Analyzes ride data and flags it if suspicious.
 * - AuditRideInput: The input type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

// Since this is a server-side flow, we need to initialize Firebase Admin here.
// We get the config from the same place as the client.
const { firestore } = initializeFirebase();

const AuditRideInputSchema = z.object({
  rideId: z.string().describe('The unique ID of the ride to audit.'),
  originAddress: z.string().describe('The starting address of the ride.'),
  destinationAddress: z.string().describe('The ending address of the ride.'),
  distanceMeters: z.number().describe('The total distance of the ride in meters.'),
  durationSeconds: z.number().describe('The total duration of the ride in seconds.'),
  finalTotal: z.number().describe('The final price charged for the ride.'),
});
export type AuditRideInput = z.infer<typeof AuditRideInputSchema>;

// Define the expected output from the AI model
const AuditResponseSchema = z.object({
    isSuspicious: z.boolean().describe('Whether the ride is considered suspicious or not.'),
    reason: z.string().describe('A brief explanation of why the ride is or is not suspicious.'),
});


export async function auditRide(input: AuditRideInput): Promise<void> {
  return auditRideFlow(input);
}

const auditPrompt = ai.definePrompt({
    name: 'auditRidePrompt',
    input: { schema: AuditRideInputSchema },
    output: { schema: AuditResponseSchema },
    prompt: `You are an expert fraud analyst for a ride-sharing app called VamO.
    Your task is to determine if a completed ride is suspicious.
    A ride is suspicious if it seems like it wasn't a real, legitimate trip taken by a passenger.

    Evaluate the following ride data:
    - Origin: {{{originAddress}}}
    - Destination: {{{destinationAddress}}}
    - Distance: {{{distanceMeters}}} meters
    - Duration: {{{durationSeconds}}} seconds
    - Price: {{{finalTotal}}} ARS

    Consider these rules for flagging a ride as suspicious:
    1.  **Too Short**: A ride is highly suspicious if the distance is less than 300 meters OR the duration is less than 120 seconds. These are likely test or fraudulent rides.
    2.  **Origin equals Destination**: If the origin and destination addresses are identical or extremely similar, it's suspicious unless the duration and price are significant (e.g., a round trip).
    3.  **Anomalous Price**: The price should be roughly proportional to distance and duration. If the price is extremely low or high for the given distance/duration, it could be suspicious. (Base fare is around 1400 ARS, price per 100m is 120 ARS).

    Based on your analysis, set 'isSuspicious' to true or false and provide a concise reason.
    If the ride seems normal, simply state that.
    `,
});


const auditRideFlow = ai.defineFlow(
  {
    name: 'auditRideFlow',
    inputSchema: AuditRideInputSchema,
    outputSchema: z.void(), // The flow itself doesn't return data, it performs an action
  },
  async (input) => {
    
    // The model will decide if the ride is suspicious.
    const { output } = await auditPrompt(input);
    
    if (output && output.isSuspicious) {
      // If the AI flags the ride, update the document in Firestore.
      const rideRef = doc(firestore, 'rides', input.rideId);
      
      try {
        await updateDoc(rideRef, {
            audited: false, // Mark as NOT audited, so it appears in the admin queue
            auditComment: `AI Flag: ${output.reason}`,
            updatedAt: serverTimestamp(),
        });
        console.log(`Ride ${input.rideId} flagged as suspicious. Reason: ${output.reason}`);
      } catch (error) {
        console.error(`Failed to update ride ${input.rideId} in Firestore:`, error);
        // We throw an error so Genkit can log this as a failed flow run
        throw new Error(`Failed to update Firestore for suspicious ride ${input.rideId}`);
      }
    } else {
        console.log(`Ride ${input.rideId} audited by AI and considered not suspicious.`);
    }
  }
);
