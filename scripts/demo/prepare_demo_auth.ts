/**
 * ════════════════════════════════════════════════════════
 *  VamO — Preparación de sesiones demo
 *  prepare_demo_auth.ts
 * ════════════════════════════════════════════════════════
 *
 *  Ejecutar UNA VEZ antes de la demo (o cuando expire la sesión).
 *  Hace login de cada usuario y guarda el storageState en disco.
 *  La demo principal lo carga directamente → CERO login en el video.
 *
 *  USO:
 *    npm run demo:auth
 *
 *  GENERA:
 *    .demo-sessions/passenger.json
 *    .demo-sessions/driver.json
 * ════════════════════════════════════════════════════════
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const BASE_URL        = (process.env.VAMO_BASE_URL        || 'http://localhost:3000').replace(/\/$/, '');
const PASSENGER_EMAIL = process.env.DEMO_PASSENGER_EMAIL  || 'demo_passenger@vamo.com';
const PASSENGER_PASS  = process.env.DEMO_PASSENGER_PASS   || 'vamo2024pass';
const DRIVER_EMAIL    = process.env.DEMO_DRIVER_EMAIL     || 'demo_driver@vamo.com';
const DRIVER_PASS     = process.env.DEMO_DRIVER_PASS      || 'vamo2024pass';
const SESSION_DIR     = '.demo-sessions';

async function saveSession(email: string, password: string, outputPath: string, label: string) {
    console.log(`\n[${label}] Iniciando sesión con ${email}…`);

    const browser = await chromium.launch({ headless: true });
    const ctx     = await browser.newContext();
    const page    = await ctx.newPage();

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();

    // Esperar hasta estar dentro del dashboard
    await page.waitForURL(/\/(dashboard|driver)/, { timeout: 25000 });
    // Dejar que Firebase persista el token en localStorage
    await page.waitForTimeout(3000);

    await ctx.storageState({ path: outputPath });
    await browser.close();

    console.log(`[${label}] ✅ Sesión guardada → ${outputPath}`);
}

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  VamO — Preparando sesiones demo         ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`  BASE_URL: ${BASE_URL}`);

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    // Las dos sesiones se crean secuencialmente (misma máquina, no hay conflicto)
    await saveSession(PASSENGER_EMAIL, PASSENGER_PASS, `${SESSION_DIR}/passenger.json`, 'PASAJERO');
    await saveSession(DRIVER_EMAIL,    DRIVER_PASS,    `${SESSION_DIR}/driver.json`,    'CONDUCTOR');

    console.log('\n✅ Sesiones listas. Ahora podés ejecutar:');
    console.log('   npm run demo:vamo\n');
}

main().catch(err => {
    console.error('❌ Error al preparar sesiones:', err);
    process.exit(1);
});
