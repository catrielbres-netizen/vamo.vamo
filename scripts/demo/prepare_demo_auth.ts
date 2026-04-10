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

dotenv.config({ path: '.env.local' });

const BASE_URL        = (process.env.VAMO_BASE_URL        || 'http://localhost:3002').replace(/\/$/, '');
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

    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button:has-text("Iniciar Sesión")').click();

    // 1. Esperar redirección al dashboard/driver
    await page.waitForURL(/\/(dashboard|driver)/, { timeout: 30000, waitUntil: 'load' });

    // 2. Manejar modal de Términos si aparece (bloqueante post-login)
    try {
        const termsBtn = page.locator('button:has-text("Acepto y Continuar")');
        if (await termsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await termsBtn.click();
            console.log(`[${label}] Modal de términos aceptado.`);
            await page.waitForTimeout(1000);
        }
    } catch (e) { }

    // 3. SEÑAL REAL: Esperar a que el loader se vaya y la UI esté lista
    await page.waitForSelector('h1, button[role="tab"], #online-toggle', { timeout: 20000 });
    
    // Dejar que Firebase persista el token en localStorage y cookies
    console.log(`[${label}] Esperando persistencia de Firebase…`);
    await page.waitForTimeout(6000);

    // BRIDGE: Copiar de IndexedDB a LocalStorage (Playwright no captura IndexedDB por defecto)
    await page.evaluate(async () => {
        try {
            const dbName = 'firebaseLocalStorageDb';
            const storeName = 'firebaseLocalStorage';
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const req = indexedDB.open(dbName);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            
            const keys: any[] = await new Promise(r => { const req = store.getAllKeys(); req.onsuccess = () => r(req.result); });
            const records: any[] = await new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result); });
            
            keys.forEach((key, i) => {
                // Firebase guarda un objeto envuelto, tomamos el .f || .value
                const val = records[i].f || records[i].value || records[i];
                localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
            });
            db.close();
            console.log("✅ IndexedDB bridged to LocalStorage");
        } catch (e) {
            console.error("❌ Bridge failed:", e);
        }
    });

    const state = await ctx.storageState({ path: outputPath });
    const hasCookies = state.cookies.length > 0;
    const hasStorage = state.origins.some(o => o.localStorage.length > 0);

    if (!hasCookies && !hasStorage) {
        throw new Error(`[${label}] Error: storageState se guardó VACÍO. Reintentá.`);
    }

    await browser.close();
    console.log(`[${label}] ✅ Sesión guardada (${state.cookies.length} cookies, ${state.origins[0]?.localStorage.length || 0} items) → ${outputPath}`);

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
