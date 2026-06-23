
export interface CityMetadata {
    key: string;
    name: string;
    center: { lat: number, lng: number };
    zoom: number;
    status: 'active' | 'draft';
}

export const CITIES: Record<string, CityMetadata> = {
    rawson: {
        key: 'rawson',
        name: 'Rawson',
        center: { lat: -43.3000, lng: -65.1023 },
        zoom: 13,
        status: 'active'
    },
    trelew: {
        key: 'trelew',
        name: 'Trelew',
        center: { lat: -43.2489, lng: -65.3051 },
        zoom: 13,
        status: 'draft'
    },
    madryn: {
        key: 'madryn',
        name: 'Puerto Madryn',
        center: { lat: -42.7692, lng: -65.0385 },
        zoom: 13,
        status: 'draft'
    },
    gaiman: {
        key: 'gaiman',
        name: 'Gaiman',
        center: { lat: -43.2897, lng: -65.4923 },
        zoom: 14,
        status: 'draft'
    },
    cordoba: {
        key: 'cordoba',
        name: 'Córdoba',
        center: { lat: -31.4201, lng: -64.1888 },
        zoom: 12,
        status: 'draft'
    },
    parana: {
        key: 'parana',
        name: 'Paraná',
        center: { lat: -31.7333, lng: -60.5297 },
        zoom: 13,
        status: 'draft'
    },
    bariloche: {
        key: 'bariloche',
        name: 'San Carlos de Bariloche',
        center: { lat: -41.1335, lng: -71.3103 },
        zoom: 13,
        status: 'draft'
    },
    'villa-la-angostura': {
        key: 'villa-la-angostura',
        name: 'Villa La Angostura',
        center: { lat: -40.7634, lng: -71.6421 },
        zoom: 13,
        status: 'draft'
    },
    'rio_gallegos': {
        key: 'rio_gallegos',
        name: 'Río Gallegos',
        center: { lat: -51.6226, lng: -69.2181 },
        zoom: 13,
        status: 'active'
    }
};

export const DEFAULT_CENTER = CITIES.rawson.center;
export const GLOBAL_CENTER = { lat: -43.3, lng: -65.2 }; // Valley view
