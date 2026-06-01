/**
 * Calcula el weekIdentifier usando timezone de Argentina (ART = UTC-3).
 * Usa algoritmo ISO week number.
 */
export function getWeekIdentifierART(date: Date = new Date()): string {
    // Convertir a tiempo de Argentina (UTC-3)
    const argDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    argDate.setHours(0, 0, 0, 0);
    // ISO week: Thursday of the week determines the year
    const dayOfWeek = argDate.getDay() || 7; // Monday=1 ... Sunday=7
    argDate.setDate(argDate.getDate() + 4 - dayOfWeek);
    const yearStart = new Date(argDate.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((argDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${argDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
