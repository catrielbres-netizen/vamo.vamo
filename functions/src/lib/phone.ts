/**
 * VamO PRO - Phone Normalization Engine
 * Ensures consistent phone formatting across all entry points.
 */
export function normalizePhone(phone: string | null | undefined): string {
    if (!phone) return "";
    
    // 1. Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // 2. Handle Argentine local formats
    // If it starts with 0, remove it
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // If it starts with 54, it's already international-ish
    if (cleaned.startsWith('54')) {
        // Keep it as is (without +)
        return cleaned;
    }
    
    // If it's 10 digits (e.g. 2804026665), assume it's Argentina (+54)
    if (cleaned.length === 10) {
        return '54' + cleaned;
    }
    
    // Fallback: return cleaned
    return cleaned;
}
