import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export interface ActiveCity {
    cityKey: string;
    name: string;
    province?: string;
    status: string;
    enabled: boolean;
    visibleInAdmin?: boolean;
    visibleInMunicipal?: boolean;
    allowDriverRecruitment?: boolean;
    allowPassengerTrips?: boolean;
    allowRealTrips?: boolean;
}

export type CityContext = 'admin' | 'municipal' | 'driver_recruitment' | 'passenger';

export interface UseActiveCitiesOptions {
    context?: CityContext;
}

export function useActiveCities({ context = 'passenger' }: UseActiveCitiesOptions = {}) {
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
                // Fetch enabled cities
                const citiesRef = collection(db, 'cities');
                
                // We fetch all enabled cities and then filter by context in client
                const q = query(
                    citiesRef,
                    where('enabled', '==', true)
                );

                const snapshot = await getDocs(q);
                const activeCities: ActiveCity[] = [];
                
                snapshot.forEach((doc) => {
                    const data = doc.data() as ActiveCity;
                    
                    let isStatusValid = false;

                    if (context === 'admin') {
                        isStatusValid = data.status === 'active' || (data.status === 'recruiting_drivers' && data.visibleInAdmin === true);
                    } else if (context === 'municipal') {
                        isStatusValid = data.status === 'active' || (data.status === 'recruiting_drivers' && data.visibleInMunicipal === true);
                    } else if (context === 'driver_recruitment') {
                        isStatusValid = data.status === 'active' || (data.status === 'recruiting_drivers' && data.allowDriverRecruitment === true);
                    } else if (context === 'passenger') {
                        isStatusValid = data.status === 'active' && data.allowPassengerTrips !== false && data.allowRealTrips !== false;
                    }

                    if (isStatusValid) {
                        let displayName = data.name;
                        // Append recruiting suffix only for specific contexts
                        if ((context === 'admin' || context === 'municipal' || context === 'driver_recruitment') && data.status === 'recruiting_drivers') {
                            displayName = `${data.name} — Reclutamiento`;
                        }

                        activeCities.push({
                            ...data,
                            cityKey: doc.id,
                            name: displayName
                        });
                    }
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
    }, [db, context]);

    return { cities, loading, error };
}
