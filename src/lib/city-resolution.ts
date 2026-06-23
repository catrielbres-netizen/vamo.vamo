/**
 * Shared utility for robust city resolution in the frontend.
 * Prioritizes structured data, then reverse geocoding, then coordinate-based fallback.
 */
import { CITIES, DEFAULT_CENTER } from './cityData';

export interface CityResolutionResult {
    city: string;
    source: 'places' | 'reverse' | 'fallback' | 'manual';
}

/**
 * Extracts city from Google Maps address components.
 */
export function extractCityFromComponents(components?: google.maps.GeocoderAddressComponent[]): string | undefined {
    if (!components) return undefined;
    
    // Priority order for city-like components in Argentina
    const cityComp = components.find(c => c.types.includes('locality')) || 
                     components.find(c => c.types.includes('administrative_area_level_2')) ||
                     components.find(c => c.types.includes('sublocality_level_1')) ||
                     components.find(c => c.types.includes('postal_town'));
    
    return cityComp?.long_name;
}

/**
 * Fallback resolution based on coordinates for Trelew/Rawson area.
 * Longitude -65.20 is our natural divider.
 */
export function resolveCityFromCoords(lat: number, lng: number): string {
    // Trelew is west of -65.20, Rawson is east
    return lng < -65.20 ? "Trelew" : "Rawson";
}

/**
 * Returns the default map coordinates for a given cityKey.
 * Useful for centering maps when there is no origin selected.
 */
export function getCityDefaultLocation(cityKey?: string): { lat: number, lng: number } {
    if (cityKey && CITIES[cityKey]) {
        return CITIES[cityKey].center;
    }
    
    // Fallbacks for legacy/unconfigured keys just in case
    switch (cityKey?.toLowerCase()) {
        case 'mercedes':
            return { lat: -34.6515, lng: -59.4307 };
        case 'rawson':
        default:
            return DEFAULT_CENTER;
    }
}

/**
 * Comprehensive resolver that logs the source and ensures a result.
 */
export async function resolveCity(
    lat: number, 
    lng: number, 
    components?: google.maps.GeocoderAddressComponent[],
    geocoder?: google.maps.Geocoder | null
): Promise<CityResolutionResult> {
    
    // 1. Try structured components
    const fromComponents = extractCityFromComponents(components);
    if (fromComponents) {
        console.log(`[CITY RESOLUTION] source: places | result: ${fromComponents}`);
        return { city: fromComponents, source: 'places' };
    }

    // 2. Try Reverse Geocoding as fallback
    if (geocoder) {
        try {
            const response = await geocoder.geocode({ location: { lat, lng } });
            if (response.results?.[0]) {
                const fromReverse = extractCityFromComponents(response.results[0].address_components);
                if (fromReverse) {
                    console.log(`[CITY RESOLUTION] source: reverse | result: ${fromReverse}`);
                    return { city: fromReverse, source: 'reverse' };
                }
            }
        } catch (e) {
            console.warn("[CITY RESOLUTION] Reverse geocoding failed", e);
        }
    }

    // 3. Final Bounding Box Fallback (Longitude -65.20)
    const fromFallback = lng < -65.20 ? "Trelew" : "Rawson";
    console.log(`[CITY RESOLUTION] source: fallback | result: ${fromFallback} (Coords: ${lat}, ${lng})`);
    return { city: fromFallback, source: 'fallback' };
}
