import { useMemo } from 'react';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';

export interface SharedRideFeatureConfig {
  enabled: boolean;
  beta: boolean;
  cities: string[];
  requireAlphaTester: boolean;
}

export function useSharedRideConfig() {
  const { profile } = useUser();
  const firestore = useFirestore();

  // 1. Centralized Feature Flag Config
  const featureConfigRef = useMemo(() => 
    firestore ? doc(firestore, 'features', 'sharedRide') : null
  , [firestore]);
  const { data: featureConfig, loading } = useDoc<SharedRideFeatureConfig>(featureConfigRef);

  const isEnabled = useMemo(() => {
    // [VamO Versión B] VamO Compartido SIEMPRE habilitado
    return true;
  }, [profile, featureConfig]);

  return {
    isEnabled,
    config: featureConfig,
    loading
  };
}
