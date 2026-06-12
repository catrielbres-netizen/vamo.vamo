import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export interface ActiveCity {
    cityKey: string;
    name: string;
    province?: string;
    status: string;
    enabled: boolean;
}

export function useActiveCities() {
    const db = useFirestore();
    const [cities, setCities] = useState<ActiveCity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!db) {
            setLoading(false);
            return;
        }

        const fetchCities = async () => {
            try {
                // Fetch enabled and active cities
                const citiesRef = collection(db, 'cities');
                const q = query(
                    citiesRef,
                    where('enabled', '==', true),
                    where('status', '==', 'active')
                );

                const snapshot = await getDocs(q);
                const activeCities: ActiveCity[] = [];
                
                snapshot.forEach((doc) => {
                    const data = doc.data() as ActiveCity;
                    activeCities.push({
                        ...data,
                        cityKey: doc.id // ensuring cityKey is always present
                    });
                });

                // Sort alphabetically by name
                activeCities.sort((a, b) => a.name.localeCompare(b.name));
                
                setCities(activeCities);
            } catch (err: any) {
                console.error("Error fetching active cities:", err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchCities();
    }, [db]);

    return { cities, loading, error };
}
