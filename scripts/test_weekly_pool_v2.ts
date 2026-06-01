/**
 * test_weekly_pool_v2.ts
 * Prueba unitaria offline de la lógica del Pozo Semanal v2.
 * Ejecutar: npx tsx scripts/test_weekly_pool_v2.ts
 */

const BASE_POOL_AMOUNT = 20000;
const AMOUNT_PER_TRIP = 100;
const MAX_POOL_AMOUNT = 600000;
const TOP_N = 30;

function calcPool(completedRides: number): number {
    return Math.min(BASE_POOL_AMOUNT + completedRides * AMOUNT_PER_TRIP, MAX_POOL_AMOUNT);
}

function getBlockPayout(rank: number, poolTotal: number): number {
    const ratio = Math.min(1, poolTotal / MAX_POOL_AMOUNT);
    if (rank <= 3)  return Math.floor(50000 * ratio);
    if (rank <= 10) return Math.floor(25000 * ratio);
    if (rank <= 20) return Math.floor(15000 * ratio);
    if (rank <= 30) return Math.floor(12500 * ratio);
    return 0;
}

function totalDistribution(poolTotal: number): number {
    let total = 0;
    for (let r = 1; r <= TOP_N; r++) total += getBlockPayout(r, poolTotal);
    return total;
}

let passed = 0;
let failed = 0;

function assert(label: string, actual: number, expected: number) {
    if (actual === expected) {
        console.log(`  ✅ ${label}: ${actual}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}: esperado=${expected}, obtenido=${actual}`);
        failed++;
    }
}

console.log('\n══════════════════════════════════════════');
console.log('  POZO SEMANAL v2 — TESTS UNITARIOS');
console.log('══════════════════════════════════════════\n');

// ── 1. Cálculo del monto del pozo ──────────────────────────────────────────────
console.log('1. CÁLCULO DEL POZO:');
assert('0 viajes → $20.000',      calcPool(0),    20000);
assert('1 viaje  → $20.100',      calcPool(1),    20100);
assert('100 viajes → $30.000',    calcPool(100),  30000);
assert('5.800 viajes → $600.000', calcPool(5800), 600000);
assert('6.000 viajes → $600.000 (tope)', calcPool(6000), 600000);

// ── 2. Distribución con pozo completo ($600.000) ───────────────────────────────
console.log('\n2. DISTRIBUCIÓN CON POZO COMPLETO ($600.000):');
const fullPool = 600000;
assert('Puesto #1 → $50.000',   getBlockPayout(1,  fullPool), 50000);
assert('Puesto #3 → $50.000',   getBlockPayout(3,  fullPool), 50000);
assert('Puesto #4 → $25.000',   getBlockPayout(4,  fullPool), 25000);
assert('Puesto #10 → $25.000',  getBlockPayout(10, fullPool), 25000);
assert('Puesto #11 → $15.000',  getBlockPayout(11, fullPool), 15000);
assert('Puesto #20 → $15.000',  getBlockPayout(20, fullPool), 15000);
assert('Puesto #21 → $12.500',  getBlockPayout(21, fullPool), 12500);
assert('Puesto #30 → $12.500',  getBlockPayout(30, fullPool), 12500);
assert('Puesto #31 → $0',       getBlockPayout(31, fullPool), 0);
const totalFull = totalDistribution(fullPool);
assert('Total distribuido = $600.000', totalFull, 600000);

// ── 3. Distribución proporcional con pozo parcial ($300.000 = 50%) ─────────────
console.log('\n3. DISTRIBUCIÓN PROPORCIONAL (pozo $300.000 = 50%):');
const halfPool = 300000;
assert('Puesto #1 → $25.000',   getBlockPayout(1,  halfPool), 25000);
assert('Puesto #4 → $12.500',   getBlockPayout(4,  halfPool), 12500);
assert('Puesto #11 → $7.500',   getBlockPayout(11, halfPool), 7500);
assert('Puesto #21 → $6.250',   getBlockPayout(21, halfPool), 6250);
assert('Puesto #31 → $0',       getBlockPayout(31, halfPool), 0);
const totalHalf = totalDistribution(halfPool);
assert('Total distribuido $300k = 50% de $600k', totalHalf, 300000);

// ── 4. Anti-duplicación (lógica conceptual) ────────────────────────────────────
console.log('\n4. ANTI-DUPLICACIÓN (conceptual):');
const countedRides = new Set<string>();
function addRide(rideId: string): boolean {
    if (countedRides.has(rideId)) return false; // ya contado
    countedRides.add(rideId);
    return true;
}
const r1 = addRide('ride_001');
const r2 = addRide('ride_001'); // duplicado
const r3 = addRide('ride_002');
assert('ride_001 primera vez: suma (true→1)',  r1 ? 1 : 0, 1);
assert('ride_001 segunda vez: NO suma (false→0)', r2 ? 1 : 0, 0);
assert('ride_002 primera vez: suma (true→1)',  r3 ? 1 : 0, 1);
assert('Total rides únicos = 2', countedRides.size, 2);

// ── 5. Aislamiento por cityKey (conceptual) ────────────────────────────────────
console.log('\n5. AISLAMIENTO MULTI-CIUDAD:');
const rawsonPool = calcPool(100);   // ciudad 1: 100 viajes
const trelewPool  = calcPool(50);   // ciudad 2: 50 viajes
const rawsonPayout1 = getBlockPayout(1, rawsonPool);
const trelewPayout1 = getBlockPayout(1, trelewPool);
console.log(`  Rawson pozo: $${rawsonPool} → puesto #1 cobra $${rawsonPayout1}`);
console.log(`  Trelew pozo: $${trelewPool} → puesto #1 cobra $${trelewPayout1}`);
assert('Rawson y Trelew tienen pozos distintos', rawsonPool !== trelewPool ? 1 : 0, 1);

// ── Resumen ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  RESULTADO: ${passed} ✅ pasados / ${failed} ❌ fallidos`);
console.log('══════════════════════════════════════════\n');
if (failed > 0) process.exit(1);
