'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance.
 *
 * It configures Genkit with the necessary plugins for Google Generative AI
 * and Next.js integration.
 */
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { nextPlugin } from '@genkit-ai/next';

export const ai = genkit({
  plugins: [
    googleAI(),
    nextPlugin()
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
