'use server';

/**
 * @fileOverview AI-powered data analysis for the admin dashboard.
 * 
 * - analyzeData - A function that analyzes ride statistics, income trends, and driver performance using AI.
 * - AnalyzeDataInput - The input type for the analyzeData function (currently empty).
 * - AnalyzeDataOutput - The return type for the analyzeData function, providing insights from the analysis.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeDataInputSchema = z.object({
  rideData: z.string().describe('Ride data in JSON format'),
  incomeData: z.string().describe('Income data in JSON format'),
  driverPerformanceData: z.string().describe('Driver performance data in JSON format'),
});
export type AnalyzeDataInput = z.infer<typeof AnalyzeDataInputSchema>;

const AnalyzeDataOutputSchema = z.object({
  insights: z.string().describe('Insights from the AI-powered data analysis.'),
});
export type AnalyzeDataOutput = z.infer<typeof AnalyzeDataOutputSchema>;

export async function analyzeData(input: AnalyzeDataInput): Promise<AnalyzeDataOutput> {
  return analyzeDataFlow(input);
}

const analyzeDataPrompt = ai.definePrompt({
  name: 'analyzeDataPrompt',
  input: { schema: AnalyzeDataInputSchema },
  output: { schema: AnalyzeDataOutputSchema },
  prompt: `You are an AI assistant specialized in analyzing transportation service data.

  Your task is to analyze the provided data related to rides, income, and driver performance to provide actionable insights for the admin.

  Analyze the following ride data: {{{rideData}}}
  Analyze the following income data: {{{incomeData}}}
  Analyze the following driver performance data: {{{driverPerformanceData}}}

  Provide a summary of key trends, potential issues, and recommendations for improving the service. Focus on aspects like ride frequency, revenue patterns, and driver efficiency.
  Structure your response as clear, concise insights.
  `,
});

const analyzeDataFlow = ai.defineFlow(
  {
    name: 'analyzeDataFlow',
    inputSchema: AnalyzeDataInputSchema,
    outputSchema: AnalyzeDataOutputSchema,
  },
  async input => {
    const { output } = await analyzeDataPrompt(input);
    return output!;
  }
);
