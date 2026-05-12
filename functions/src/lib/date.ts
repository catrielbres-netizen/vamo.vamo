
/**
 * [VamO PRO] Bulletproof Argentina Date (YYYY-MM-DD)
 * Consistent between server (Node) and client (Browser).
 */
export function getArgentinaDateStr(): string {
    const d = new Date();
    const argDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const y = argDate.getFullYear();
    const m = String(argDate.getMonth() + 1).padStart(2, '0');
    const day = String(argDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/**
 * [VamO PRO] Get a unique week identifier (e.g., 2024-W15)
 */
export function getWeekId(): string {
    const d = new Date();
    const argDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    
    const year = argDate.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}
