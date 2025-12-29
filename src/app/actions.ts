// @/app/actions.ts
'use server';

import {
  analyzeData,
  AnalyzeDataInput,
} from '@/ai/flows/admin-ai-data-analysis';
import {
  automaticFareCalculationWithMaps,
  AutomaticFareCalculationWithMapsInput,
} from '@/ai/flows/automatic-fare-calculation-with-maps';

export async function calculateFareAction(
  input: AutomaticFareCalculationWithMapsInput
) {
  return await automaticFareCalculationWithMaps(input);
}

export async function analyzeDataAction(input: AnalyzeDataInput) {
  const result = await analyzeData(input);
  return result.insights;
}
