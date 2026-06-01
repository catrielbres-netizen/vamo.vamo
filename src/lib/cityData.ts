
export interface CityMetadata {
    key: string;
    name: string;
    center: { lat: number, lng: number };
    zoom: number;
}

export const CITIES: Record<string, CityMetadata> = {
    rawson: {
        key: 'rawson',
        name: 'Rawson',
        center: { lat: -43.3000, lng: -65.1023 },
        zoom: 13
    },
    trelew: {
        key: 'trelew',
        name: 'Trelew',
        center: { lat: -43.2489, lng: -65.3051 },
        zoom: 13
    },
    madryn: {
        key: 'madryn',
        name: 'Puerto Madryn',
        center: { lat: -42.7692, lng: -65.0385 },
        zoom: 13
    },
    gaiman: {
        key: 'gaiman',
        name: 'Gaiman',
        center: { lat: -43.2897, lng: -65.4923 },
        zoom: 14
    },
    cordoba: {
        key: 'cordoba',
        name: 'Córdoba',
        center: { lat: -31.4201, lng: -64.1888 },
        zoom: 12
    },
    parana: {
        key: 'parana',
        name: 'Paraná',
        center: { lat: -31.7333, lng: -60.5297 },
        zoom: 13
    }
};

export const DEFAULT_CENTER = CITIES.rawson.center;
export const GLOBAL_CENTER = { lat: -43.3, lng: -65.2 }; // Valley view
