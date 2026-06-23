// functions/src/lib/cityResolver.ts

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
import { normalizeCityKey } from "./city";

// ----------------------------------------------------------------------
//  Allowed city keys and their geographic bounding boxes (approximate).
//  Add new entries here when new municipalities are onboarded.
// ----------------------------------------------------------------------
interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const CITY_DEFINITIONS: Record<
  string,
  { nameMap: string[]; status: 'active' | 'draft'; bbox: BoundingBox }
> = {
  rawson: {
    // accepted aliases for Rawson (including Playa Union)
    nameMap: ["rawson", "playa union"],
    status: 'active',
    bbox: {
      minLat: -43.35,
      maxLat: -43.25,
      minLng: -65.15,
      maxLng: -65.05,
    },
  },
  trelew: {
    nameMap: ["trelew"],
    status: 'draft',
    bbox: {
      minLat: -43.30,
      maxLat: -43.20,
      minLng: -65.30,
      maxLng: -65.20,
    },
  },
  bariloche: {
    nameMap: ["bariloche", "san carlos de bariloche"],
    status: 'draft',
    bbox: {
      minLat: -41.25,
      maxLat: -41.05,
      minLng: -71.50,
      maxLng: -71.10,
    },
  },
  "villa-la-angostura": {
    nameMap: ["villa la angostura", "angostura"],
    status: 'draft',
    bbox: {
      minLat: -40.85,
      maxLat: -40.70,
      minLng: -71.75,
      maxLng: -71.50,
    },
  },
  // ← add more municipalities here
};

/**
 * Validate that a supplied `cityKey` exists in the whitelist and that the
 * coordinates fall inside the corresponding bounding box.
 */
function isValidSuppliedKey(suppliedKey: string, lat: number, lng: number): boolean {
  const def = CITY_DEFINITIONS[suppliedKey];
  if (!def) return false; // not an allowed key
  const { bbox } = def;
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

/**
 * Resolve a deterministic cityKey.
 */
export function resolveCityKey(input: {
  cityKey?: string | null;
  city?: string | null;
  lat: number;
  lng: number;
}): string | null {
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
    const normalized = normalizeCityKey(input.city);
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
    if (
      input.lat >= bbox.minLat &&
      input.lat <= bbox.maxLat &&
      input.lng >= bbox.minLng &&
      input.lng <= bbox.maxLng
    ) {
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
