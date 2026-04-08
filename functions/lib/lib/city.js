"use strict";
/**
 * [VamO PRO] Neutral City Helpers
 * Used by multiple modules without causing circular dependencies with index.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCityKey = normalizeCityKey;
exports.normalizeCity = normalizeCity;
/**
 * Convierte un nombre de ciudad a su clave normalizada.
 * Ejemplo: "Río Negro" → "rio-negro" | "Rawson" → "rawson"
 */
function normalizeCityKey(city) {
    return city
        .toLowerCase()
        .normalize('NFD') // separa caracteres de sus diacríticos
        .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos
        .replace(/[^a-z0-9]+/g, '-') // reemplaza caracteres especiales con guión
        .replace(/^-+|-+$/g, ''); // elimina guiones al inicio/fin
}
/**
 * Wrapper for normalizeCityKey with fallback.
 */
function normalizeCity(city) {
    return normalizeCityKey(city || "");
}
//# sourceMappingURL=city.js.map