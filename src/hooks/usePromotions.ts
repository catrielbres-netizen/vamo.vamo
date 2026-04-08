
import { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { Promotion, PromotionContext } from '@/lib/types';

export function usePromotions(context: PromotionContext, amount?: number, city?: string) {
    const firebaseApp = useFirebaseApp();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseApp) return;

        const fetchPromos = async () => {
            setIsLoading(true);
            try {
                const functions = getFunctions(firebaseApp, 'us-central1');
                const getPromos = httpsCallable(functions, 'getAvailablePromotionsV1');
                const result = await getPromos({ context, amount, city });
                
                const data = result.data as { promotions: Promotion[] };
                if (data.promotions) {
                    setPromotions(data.promotions);
                }
            } catch (err: any) {
                console.error(`[usePromotions] Error fetching for context ${context}:`, err);
                setError(err.message || 'Error al obtener promociones');
            } finally {
                setIsLoading(false);
            }
        };

        fetchPromos();
    }, [firebaseApp, context, amount, city]);

    const bestPromo = useMemo(() => {
        if (promotions.length === 0) return null;
        // The backend already sorts by priority, but we can have extra client logic here if needed
        return promotions[0];
    }, [promotions]);

    return { promotions, bestPromo, isLoading, error };
}
