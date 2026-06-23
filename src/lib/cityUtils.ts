/**
 * Utility functions for city handling.
 */

/**
 * Returns a canonical, robust cityKey.
 * Replaces dashes with underscores, lowercases, removes accents,
 * and converts specific variations to their canonical representation.
 */
export function canonicalCityKey(input: string | null | undefined): string {
    if (!input) return '';

    let key = input.trim().toLowerCase();

    // Remove accents
    key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Replace dashes and spaces with underscores
    key = key.replace(/[-\s]+/g, '_');

    // Strip out any remaining non-alphanumeric/underscore characters
    key = key.replace(/[^a-z0-9_]/g, '');

    return key;
}
