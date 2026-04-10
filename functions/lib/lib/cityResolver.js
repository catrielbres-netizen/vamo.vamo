"use strict";
// functions/src/lib/cityResolver.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCityKey = resolveCityKey;
/**
 * Backend‑only utility to deterministically resolve a `cityKey`.
 *
 * Strategy (priority order):
 *   1️⃣ If a `cityKey` is supplied by the client, it is **validated** against a whitelist
 *      and against the geographic bounding box for that city. Only when both checks pass
 *      is the supplied key accepted.
 *   2️⃣ If a city name is supplied, it is normalized and looked‑up in a name‑to‑key map.
 *   3️⃣ As a last resort, the latitude/longitude are checked against known bounding boxes.
 *
 * The function returns the resolved key (e.g. "rawson") or `null` when the city cannot be
 * identified.
 */
const city_1 = require("./city");
const CITY_DEFINITIONS = {
    rawson: {
        // accepted aliases for Rawson (including Playa Union)
        nameMap: ["rawson", "playa union"],
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
    // ← add more municipalities here
};
/**
 * Validate that a supplied `cityKey` exists in the whitelist and that the
 * coordinates fall inside the corresponding bounding box.
 */
function isValidSuppliedKey(suppliedKey, lat, lng) {
    const def = CITY_DEFINITIONS[suppliedKey];
    if (!def)
        return false; // not an allowed key
    const { bbox } = def;
    return (lat >= bbox.minLat &&
        lat <= bbox.maxLat &&
        lng >= bbox.minLng &&
        lng <= bbox.maxLng);
}
/**
 * Resolve a deterministic cityKey.
 */
function resolveCityKey(input) {
    // ------------------------------------------------------------------
    // 1️⃣  Front‑end supplied cityKey – validate it.
    // ------------------------------------------------------------------
    if (input.cityKey) {
        const supplied = input.cityKey.toLowerCase().trim();
        console.log('[CITY_RESOLVER] Received cityKey from client', supplied);
        if (isValidSuppliedKey(supplied, input.lat, input.lng)) {
            console.log('[CITY_RESOLVER] client cityKey accepted', supplied);
            return supplied;
        }
        console.warn('[CITY_RESOLVER] client cityKey rejected (mismatch or unknown)', {
            supplied,
            lat: input.lat,
            lng: input.lng,
        });
        // fall‑through to normal resolution
    }
    // ------------------------------------------------------------------
    // 2️⃣  Resolve by city name (if provided).
    // ------------------------------------------------------------------
    if (input.city) {
        const normalized = (0, city_1.normalizeCityKey)(input.city);
        for (const [key, def] of Object.entries(CITY_DEFINITIONS)) {
            if (def.nameMap.includes(normalized)) {
                console.log('[CITY_RESOLVER] Resolved by name mapping', {
                    inputCity: input.city,
                    normalized,
                    resolvedKey: key,
                });
                return key;
            }
        }
    }
    // ------------------------------------------------------------------
    // 3️⃣  Bounding‑box fallback based solely on coordinates.
    // ------------------------------------------------------------------
    for (const [key, def] of Object.entries(CITY_DEFINITIONS)) {
        const { bbox } = def;
        if (input.lat >= bbox.minLat &&
            input.lat <= bbox.maxLat &&
            input.lng >= bbox.minLng &&
            input.lng <= bbox.maxLng) {
            console.log('[CITY_RESOLVER] Resolved by coordinates', {
                lat: input.lat,
                lng: input.lng,
                resolvedKey: key,
            });
            return key;
        }
    }
    // No match – caller must handle the null result.
    console.error('[CITY_RESOLVER] Unable to resolve cityKey', {
        cityKey: input.cityKey,
        city: input.city,
        lat: input.lat,
        lng: input.lng,
    });
    return null;
}
//# sourceMappingURL=cityResolver.js.map