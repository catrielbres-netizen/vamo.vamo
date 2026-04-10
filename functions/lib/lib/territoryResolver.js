"use strict";
// functions/src/lib/territoryResolver.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePricingMunicipality = resolvePricingMunicipality;
/**
 * Resolve the pricing municipality key for a ride origin.
 *
 * The resolver follows a deterministic priority chain:
 *   1️⃣ If a `cityKey` is supplied by the client, it is validated against a whitelist
 *      and its geographic bounding box. When valid, it is accepted.
 *   2️⃣ If a city name is supplied, it is normalized and looked up in an alias map.
 *   3️⃣ As a fallback, the latitude/longitude are matched against known bounding boxes.
 *   4️⃣ If none match, the resolver returns null.
 *
 * The function returns both the resolved key and the method used, enabling callers
 * to log the resolution path.
 */
const city_1 = require("./city");
const CITY_DEFINITIONS = {
    rawson: {
        nameMap: ["rawson", "playa union", "playa unión"],
        bbox: {
            minLat: -43.35,
            maxLat: -43.25,
            minLng: -65.15,
            maxLng: -65.05,
        },
    },
    trelew: {
        nameMap: ["trelew"],
        bbox: {
            minLat: -43.30,
            maxLat: -43.20,
            minLng: -65.30,
            maxLng: -65.20,
        },
    },
    // Add more municipalities here as needed
};
function isValidSuppliedKey(suppliedKey, lat, lng) {
    const def = CITY_DEFINITIONS[suppliedKey];
    if (!def)
        return false;
    const { bbox } = def;
    return (lat >= bbox.minLat &&
        lat <= bbox.maxLat &&
        lng >= bbox.minLng &&
        lng <= bbox.maxLng);
}
/**
 * Resolve pricing municipality.
 */
function resolvePricingMunicipality(input) {
    // 1️⃣ Provided cityKey – validate it
    if (input.cityKey) {
        const supplied = input.cityKey.toLowerCase().trim();
        console.log("[TERRITORY_RESOLVER] Received cityKey from client", supplied);
        if (isValidSuppliedKey(supplied, input.lat, input.lng)) {
            console.log("[TERRITORY_RESOLVER] client cityKey accepted", supplied);
            return { pricingMunicipalityKey: supplied, method: "provided_key" };
        }
        console.warn("[TERRITORY_RESOLVER] client cityKey rejected (mismatch or unknown)", {
            supplied,
            lat: input.lat,
            lng: input.lng,
        });
        // fall‑through to other strategies
    }
    // 2️⃣ Resolve by city name (alias)
    if (input.city) {
        const normalized = (0, city_1.normalizeCityKey)(input.city);
        for (const [key, def] of Object.entries(CITY_DEFINITIONS)) {
            if (def.nameMap.includes(normalized)) {
                console.log("[TERRITORY_RESOLVER] Resolved by name alias", {
                    inputCity: input.city,
                    normalized,
                    resolvedKey: key,
                });
                return { pricingMunicipalityKey: key, method: "city_alias" };
            }
        }
    }
    // 3️⃣ Bounding‑box fallback
    for (const [key, def] of Object.entries(CITY_DEFINITIONS)) {
        const { bbox } = def;
        if (input.lat >= bbox.minLat &&
            input.lat <= bbox.maxLat &&
            input.lng >= bbox.minLng &&
            input.lng <= bbox.maxLng) {
            console.log("[TERRITORY_RESOLVER] Resolved by coordinates", {
                lat: input.lat,
                lng: input.lng,
                resolvedKey: key,
            });
            return { pricingMunicipalityKey: key, method: "bounds_fallback" };
        }
    }
    // 4️⃣ Unresolved
    console.error("[TERRITORY_RESOLVER] Unable to resolve pricing municipality", {
        cityKey: input.cityKey,
        city: input.city,
        lat: input.lat,
        lng: input.lng,
    });
    return { pricingMunicipalityKey: null, method: "unresolved" };
}
//# sourceMappingURL=territoryResolver.js.map