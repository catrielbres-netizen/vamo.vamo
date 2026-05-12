
/**
 * [VamO PRO] Bulletproof Argentina Date (YYYY-MM-DD)
 * Consistent between server (Node) and client (Browser).
 */
export function getArgentinaDateStr(): string {
    const d = new Date();
    // Use Intl to get parts for the specific timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    const parts = formatter.formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    return `${y}-${m}-${day}`;
}
/**
 * [VamO PRO] Get a unique week identifier (e.g., 2024-W15)
 */
export function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    const argDate = new Date(y, m, day);
    const firstDayOfYear = new Date(y, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}
