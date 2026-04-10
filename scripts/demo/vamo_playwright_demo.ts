/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  VamO — Demo Comercial Split-Screen v4  (storageState edition)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  REQUIERE: ejecutar primero `npm run demo:auth` para generar las sesiones.
 *
 *  Carga storageState (localStorage + cookies de Firebase) en cada contexto.
 *  No hace login en runtime → CERO pantallas de login en el video.
 *
 *  GRABACIÓN:
 *    Dos archivos .webm en videos/demo/ que se unen con ffmpeg:
 *
 *    ffmpeg -i videos/demo/passenger.webm -i videos/demo/driver.webm `
 *      -filter_complex "[0:v][1:v]hstack=inputs=2" `
 *      -c:v libx264 -crf 17 vamo_demo_final.mp4
 *
 *  USO:
 *    npm run demo:vamo
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

// ─── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = (process.env.VAMO_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SESSION_DIR = '.demo-sessions';
const VIDEO_DIR   = 'videos/demo';
const PANEL_W     = 960;
const PANEL_H     = 1080;

// ─── Timing ────────────────────────────────────────────────────────────────────
const T = {
    SECTION:    2500,   // entre secciones normales
    FOCUS:      3500,   // secciones de negocio importantes
    SPOTLIGHT:  4500,   // bono / referidos / pozo semanal / billetera
    IN_RIDE:    7000,   // en trayecto
    CLOSING:    6000,   // cierre final
    HOVER:       500,   // hover antes de click
    TYPE_DELAY:   55,   // delay entre teclas al escribir
    SEARCH_WAIT: 5000,  // espera después de pedir viaje
    OFFER_SHOW:  5000,  // cuánto se muestra la oferta antes de aceptar
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function beat(ms: number, label?: string): Promise<void> {
    if (label) console.log(`       ⏱  ${label} (${ms}ms)`);
    return new Promise<void>(r => setTimeout(r, ms));
}

async function demoClick(page: Page, selector: string, timeout = 12000) {
    try {
        const el = page.locator(selector).first();
        await el.waitFor({ state: 'visible', timeout });
        await el.hover();
        await beat(T.HOVER);
        await el.click();
    } catch (e: any) {
        console.warn(`    ⚠  demoClick("${selector}"): ${e.message?.split('\n')[0]}`);
    }
}

async function smoothScroll(page: Page, direction: 'down' | 'up', totalPx = 450) {
    const sign  = direction === 'down' ? 1 : -1;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, sign * (totalPx / steps));
        await beat(90);
    }
    await beat(300);
}

async function waitVisible(page: Page, selector: string, timeout = 25000): Promise<boolean> {
    try {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout });
        return true;
    } catch {
        console.warn(`    ⚠  waitVisible("${selector}"): no apareció en ${timeout}ms`);
        return false;
    }
}

async function goToTab(page: Page, tabText: string, role: string) {
    console.log(`    [${role}] → Tab "${tabText}"`);
    // Try to find the tab by role and text, then fallback to button text
    const selectors = [
        `[role="tab"]:has-text("${tabText}")`,
        `button:has-text("${tabText}")`,
        `a:has-text("${tabText}")`
    ];

    let found = false;
    for (const sel of selectors) {
        const locator = page.locator(sel).first();
        if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
            await locator.hover();
            await beat(350);
            await locator.click();
            await beat(1500);
            found = true;
            break;
        }
    }

    if (!found) {
        console.warn(`    ⚠  Tab "${tabText}" no visible para [${role}]. Intentando click por coordenadas si es posible…`);
    }
}

// ─── Verificación de sesiones ──────────────────────────────────────────────────

function assertSessions() {
    const p = path.join(SESSION_DIR, 'passenger.json');
    const d = path.join(SESSION_DIR, 'driver.json');
    if (!fs.existsSync(p) || !fs.existsSync(d)) {
        console.error('');
        console.error('❌ No se encontraron los archivos de sesión.');
        console.error(`   Esperados en: ${path.resolve(SESSION_DIR)}/`);
        console.error('');
        console.error('   Ejecutá primero:   npm run demo:auth');
        console.error('');
        process.exit(1);
    }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────────

async function runDemo() {
    assertSessions();

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  VamO — Demo Comercial Split-Screen v4                   ║');
    console.log('║  storageState · 0 logins en video · 7 Escenas            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  BASE_URL : ${BASE_URL}`);
    console.log(`  VIDEO    : ${path.resolve(VIDEO_DIR)}/`);
    console.log('');

    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

    const browser: Browser = await chromium.launch({
        headless: false,
        slowMo:   25,
        args: ['--disable-notifications', '--disable-infobars'],
    });

    // ── Contexto PASAJERO ──────────────────────────────────────────────────────
    // storageState inyecta localStorage+cookies → Firebase ya reconoce la sesión
    const passengerCtx: BrowserContext = await browser.newContext({
        storageState: path.join(SESSION_DIR, 'passenger.json'),
        viewport:     { width: PANEL_W, height: PANEL_H },
        recordVideo:  { dir: VIDEO_DIR, size: { width: PANEL_W, height: PANEL_H } },
        permissions:  ['geolocation'],
        geolocation:  { latitude: -43.3002, longitude: -65.1023 },
    });

    // ── Contexto CONDUCTOR ─────────────────────────────────────────────────────
    const driverCtx: BrowserContext = await browser.newContext({
        storageState: path.join(SESSION_DIR, 'driver.json'),
        viewport:     { width: PANEL_W, height: PANEL_H },
        recordVideo:  { dir: VIDEO_DIR, size: { width: PANEL_W, height: PANEL_H } },
        permissions:  ['geolocation'],
        geolocation:  { latitude: -43.3002, longitude: -65.1023 },
    });

    const pPage: Page = await passengerCtx.newPage();
    const dPage: Page = await driverCtx.newPage();

    try {
        // ══════════════════════════════════════════════════════════════════════
        // PUNTO DE INICIO — Navegar directamente al dashboard (sin login)
        // Ambas páginas cargan ya autenticadas gracias al storageState.
        // Este es el primer frame que verá el espectador.
        // ══════════════════════════════════════════════════════════════════════
        console.log('📍 Cargando dashboards (ya autenticados)…');
        await Promise.all([
            pPage.goto(`${BASE_URL}/dashboard/ride`,  { waitUntil: 'load', timeout: 45000 }),
            dPage.goto(`${BASE_URL}/driver/rides`,    { waitUntil: 'load', timeout: 45000 }),
        ]);

        // Esperar que la UI esté completamente renderizada antes de mostrar nada
        // Si Firebase redirige a /login (sesión expirada), lo detectamos.
        await Promise.all([
            pPage.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {
                throw new Error('PASAJERO fue redirigido al login o no cargó. Ejecutá: npm run demo:auth');
            }),
            dPage.waitForURL(/\/driver/, { timeout: 20000 }).catch(() => {
                throw new Error('CONDUCTOR fue redirigido al login o no cargó. Ejecutá: npm run demo:auth');
            }),
        ]);

        // Asegurar que el loader se haya ido en ambos
        await Promise.all([
            pPage.waitForSelector('button[role="tab"]', { timeout: 15000 }).catch(() => console.warn('⚠ Tabs de pasajero no detectados')),
            dPage.waitForSelector('#online-toggle', { timeout: 15000 }).catch(() => console.warn('⚠ Toggle de conductor no detectado')),
        ]);

        console.log('  ✅ Ambos dashboards cargados. Punto de inicio sincronizado.\n');
        await beat(2500, 'Estabilización inicial de la UI');

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 1 — INTRO
        // ══════════════════════════════════════════════════════════════════════
        console.log('═══════════════════════════════════════════════════════');
        console.log(' ESCENA 1 — INTRO');
        console.log('═══════════════════════════════════════════════════════');
        await beat(4000, 'Intro — ambas pantallas quietas, logueadas');

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 2 — PASAJERO: perfil / nivel / bono / referidos / historial / info
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 2 — RECORRIDO PASAJERO');
        console.log('═══════════════════════════════════════════════════════');

        // 2a. Perfil: nivel y bono de bienvenida
        await goToTab(pPage, 'Perfil', 'PASAJERO');
        console.log('    [PASAJERO] Nivel VamO PRO y bono de bienvenida…');
        await beat(T.FOCUS, 'Nivel visible');
        await smoothScroll(pPage, 'down', 380);
        await beat(T.SPOTLIGHT, 'Bono de bienvenida y progreso mensual');

        // 2b. Referidos
        console.log('    [PASAJERO] Referidos y código de invitación…');
        await smoothScroll(pPage, 'down', 420);
        await beat(T.FOCUS, 'Código de referido visible');
        await smoothScroll(pPage, 'down', 300);
        await beat(T.SECTION, 'Referidos acreditados');
        await smoothScroll(pPage, 'up', 1200);
        await beat(800);

        // 2c. Historial
        await goToTab(pPage, 'Historial', 'PASAJERO');
        console.log('    [PASAJERO] Historial de viajes…');
        await beat(T.SECTION, 'Historial visible');

        // 2d. Info de tarifas
        await goToTab(pPage, 'Info', 'PASAJERO');
        console.log('    [PASAJERO] Tarifas del servicio…');
        await beat(T.SECTION, 'Info de tarifas visible');
        const acordeon = pPage.locator('button:has-text("Ver Tarifas")').first();
        if (await acordeon.isVisible({ timeout: 3000 }).catch(() => false)) {
            await acordeon.hover();
            await beat(350);
            await acordeon.click();
            await beat(T.SECTION, 'Acordeón expandido');
        }

        // Volver a Viaje para la operación
        await goToTab(pPage, 'Viaje', 'PASAJERO');
        await beat(1500, 'Pasajero listo para pedir viaje');

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 3 — CONDUCTOR: billetera / historial / cargar / retirar
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 3 — CONDUCTOR: BILLETERA');
        console.log('═══════════════════════════════════════════════════════');

        await goToTab(dPage, 'Billetera', 'CONDUCTOR');
        console.log('    [CONDUCTOR] Saldo actual…');
        await beat(T.FOCUS, 'Saldo visible');

        await smoothScroll(dPage, 'down', 450);
        await beat(T.SPOTLIGHT, 'Historial de transacciones — ganancias + premios');
        await smoothScroll(dPage, 'up', 500);
        await beat(T.SECTION, 'Saldo visible nuevamente');

        // Modal Cargar Saldo
        console.log('    [CONDUCTOR] Modal Cargar Saldo (Mercado Pago)…');
        const cargarBtn = dPage.locator('button:has-text("Cargar Saldo")').first();
        if (await cargarBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await cargarBtn.hover();
            await beat(T.HOVER);
            await cargarBtn.click();
            await beat(T.SPOTLIGHT, 'Modal Cargar Saldo — opciones visibles');
            await dPage.keyboard.press('Escape');
            await beat(1000);
        }

        // Modal Retirar Saldo
        console.log('    [CONDUCTOR] Modal Retirar Saldo…');
        const retirarBtn = dPage.locator('button:has-text("Retirar Saldo")').first();
        if (await retirarBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await retirarBtn.hover();
            await beat(T.HOVER);
            await retirarBtn.click();
            await beat(T.SPOTLIGHT, 'Modal Retirar — formulario bancario visible');
            await dPage.keyboard.press('Escape');
            await beat(1000);
        }

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 4 — GAMIFICACIÓN (ESCENA CLAVE)
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 4 — GAMIFICACIÓN (nivel / puntos / pozo)');
        console.log('═══════════════════════════════════════════════════════');

        await goToTab(dPage, 'Perfil', 'CONDUCTOR');
        await beat(T.SECTION, 'Perfil del conductor cargado');

        await smoothScroll(dPage, 'down', 300);
        await beat(T.SECTION, 'Info general del conductor');

        console.log('    [CONDUCTOR] ⭐ Nivel / Puntos / Pozo Semanal…');
        await smoothScroll(dPage, 'down', 350);
        await beat(T.SPOTLIGHT, 'Nivel Oro visible');
        await smoothScroll(dPage, 'down', 300);
        await beat(T.SPOTLIGHT, 'Puntos semanales y barra de progreso');
        await smoothScroll(dPage, 'down', 200);
        await beat(T.SPOTLIGHT + 1000, '💰 POZO SEMANAL visible — escena más importante');

        // Referidos del conductor
        console.log('    [CONDUCTOR] Referidos y código de invitación…');
        await smoothScroll(dPage, 'down', 400);
        await beat(T.FOCUS, 'Código de referido del conductor');
        await smoothScroll(dPage, 'down', 300);
        await beat(T.SECTION, 'Referidos acreditados');

        await smoothScroll(dPage, 'up', 1600);
        await beat(800);

        await goToTab(dPage, 'Viajes', 'CONDUCTOR');
        await beat(1500, 'Conductor listo para operar');

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 5 — OPERACIÓN REAL
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 5 — OPERACIÓN REAL');
        console.log('═══════════════════════════════════════════════════════');

        // Mock GPS si está en dev
        const mockBtn = dPage.locator('button:has-text("MOCK GPS")').first();
        if (await mockBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const label = await mockBtn.innerText().catch(() => '');
            if (label.includes('OFF')) {
                await mockBtn.click();
                await beat(1000);
            }
        }

        // Conductor ONLINE
        console.log('    [CONDUCTOR] Poniéndose en línea…');
        const onlineSwitch = dPage.locator('#online-toggle').first();
        if (await waitVisible(dPage, '#online-toggle', 10000)) {
            const checked = await onlineSwitch.getAttribute('aria-checked').catch(() => 'false');
            if (checked !== 'true') {
                await onlineSwitch.hover();
                await beat(T.HOVER);
                await onlineSwitch.click();
            }
        }
        await beat(3500, 'Conductor online — esperando viajes');

        // Pasajero: origen
        console.log('    [PASAJERO] Ingresando origen…');
        const originInput = pPage.locator('input[placeholder="Punto de partida"]').first();
        if (await originInput.isVisible({ timeout: 8000 }).catch(() => false)) {
            await originInput.click();
            await beat(400);
            await originInput.fill('');
            await originInput.pressSequentially('Mariano Moreno 650', { delay: T.TYPE_DELAY });
            await beat(2000, 'Sugerencias de origen');
            const sug = pPage.locator('[role="option"], .pac-item').first();
            if (await sug.isVisible({ timeout: 2500 }).catch(() => false)) {
                await sug.click();
            } else {
                await pPage.keyboard.press('ArrowDown');
                await pPage.keyboard.press('Enter');
            }
            await beat(1500);
        }

        // Pasajero: destino
        console.log('    [PASAJERO] Ingresando destino…');
        const destInput = pPage.locator('input[placeholder="¿A dónde vas?"]').first();
        if (await destInput.isVisible({ timeout: 8000 }).catch(() => false)) {
            await destInput.click();
            await beat(400);
            await destInput.fill('');
            await destInput.pressSequentially('Av. Rivadavia 250', { delay: T.TYPE_DELAY });
            await beat(2000, 'Sugerencias de destino');
            const sug = pPage.locator('[role="option"], .pac-item').first();
            if (await sug.isVisible({ timeout: 2500 }).catch(() => false)) {
                await sug.click();
            } else {
                await pPage.keyboard.press('ArrowDown');
                await pPage.keyboard.press('Enter');
            }
            await beat(1500);
        }

        // Tipo Premium
        console.log('    [PASAJERO] Seleccionando Premium…');
        const premiumBtn = pPage.locator('button:has-text("Premium")').first();
        if (await premiumBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
            await premiumBtn.hover();
            await beat(T.HOVER);
            await premiumBtn.click();
            await beat(3000, 'Tarifa estimada calculada');
        }

        // Bono de bienvenida
        const bonusToggle = pPage.locator('button:has-text("Bono de Bienvenida")').first();
        if (await bonusToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('    [PASAJERO] Aplicando bono de bienvenida 10%…');
            await bonusToggle.hover();
            await beat(T.HOVER);
            await bonusToggle.click();
            await beat(1500, 'Bono aplicado — precio con descuento visible');
        }

        // PEDIR VIAJE
        console.log('    [PASAJERO] Confirmando solicitud…');
        const pedirBtn = pPage.locator('button:has-text("Pedir Viaje")').first();
        if (await pedirBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
            await pedirBtn.hover();
            await beat(700);
            await pedirBtn.click();
        }
        await beat(T.SEARCH_WAIT, '🔍 BUSCANDO CONDUCTOR — estado visible en pasajero');

        // Conductor recibe oferta y ACEPTA
        console.log('    [CONDUCTOR] Esperando oferta…');
        const acceptBtn   = dPage.locator('button:has-text("Aceptar")').first();
        const offerArrived = await waitVisible(dPage, 'button:has-text("Aceptar")', 60000);

        if (offerArrived) {
            console.log('    [CONDUCTOR] 🔔 OFERTA RECIBIDA');
            await beat(T.OFFER_SHOW, 'Oferta visible simultáneamente en AMBAS pantallas');
            await acceptBtn.hover();
            await beat(700);
            await acceptBtn.click();
            console.log('    [CONDUCTOR] ✅ Viaje ACEPTADO');
            await beat(4500, 'Asignación confirmada — UI de ambos actualizada');
        } else {
            console.warn('    ⚠  Oferta no llegó. Continuando…');
        }

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 6 — VIAJE
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 6 — VIAJE EN CURSO');
        console.log('═══════════════════════════════════════════════════════');

        await beat(3500, 'Conductor en camino — pasajero lo ve acercarse');

        // Llegada
        console.log('    [CONDUCTOR] Marcando llegada…');
        if (await waitVisible(dPage, 'button:has-text("LLEGUÉ")', 20000)) {
            await demoClick(dPage, 'button:has-text("LLEGUÉ")', 20000);
        } else {
            await demoClick(dPage, 'button:has-text("Llegué")', 5000);
        }
        await beat(4000, 'Pasajero ve "El conductor llegó"');

        // Iniciar
        console.log('    [CONDUCTOR] Iniciando viaje…');
        if (await waitVisible(dPage, 'button:has-text("INICIAR")', 15000)) {
            await demoClick(dPage, 'button:has-text("INICIAR")', 15000);
        }
        await beat(T.IN_RIDE, '✈  EN TRAYECTO — ambas pantallas muestran viaje activo');

        // Finalizar
        console.log('    [CONDUCTOR] Finalizando viaje…');
        if (await waitVisible(dPage, 'button:has-text("FINALIZAR")', 15000)) {
            await demoClick(dPage, 'button:has-text("FINALIZAR")', 15000);
        }
        await beat(2500, 'Viaje finalizado');

        // Confirmar cobro si aplica
        if (await waitVisible(dPage, 'button:has-text("COBRO")', 6000)) {
            console.log('    [CONDUCTOR] Confirmando cobro…');
            await demoClick(dPage, 'button:has-text("COBRO")', 6000);
        }

        // Pasajero: resumen
        console.log('    [PASAJERO] Mostrando resumen del viaje…');
        await beat(4000, 'Resumen visible en pantalla del pasajero');
        await smoothScroll(pPage, 'down', 250);
        await beat(T.FOCUS, 'Detalle completo del viaje');

        // ══════════════════════════════════════════════════════════════════════
        // ESCENA 7 — RESULTADO ECONÓMICO (cierre del pitch)
        // ══════════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(' ESCENA 7 — CIERRE ECONÓMICO');
        console.log('═══════════════════════════════════════════════════════');

        await goToTab(dPage, 'Billetera', 'CONDUCTOR');
        console.log('    [CONDUCTOR] Saldo actualizado post-viaje…');
        await beat(T.FOCUS, 'Saldo actualizado visible');

        await smoothScroll(dPage, 'down', 420);
        await beat(T.SPOTLIGHT, 'Nueva ganancia del viaje en historial');
        await smoothScroll(dPage, 'up', 500);
        await beat(T.CLOSING, '💼 CIERRE — saldo final visible al municipio/inversor');

        // Pausa de cierre para corte limpio
        await beat(2000, 'Fade out — fin del video');
        console.log('\n  ✅ DEMO COMPLETADA EXITOSAMENTE.');

    } catch (err: any) {
        console.error('\n❌ Error en la demo:', err.message || err);
        try {
            const errDir = path.join(VIDEO_DIR, 'debug');
            if (!fs.existsSync(errDir)) fs.mkdirSync(errDir, { recursive: true });
            await pPage.screenshot({ path: path.join(errDir, 'error_passenger.png'), fullPage: true });
            await dPage.screenshot({ path: path.join(errDir, 'error_driver.png'), fullPage: true });
            console.log('  📸 Screenshots → ', errDir);
        } catch (_) {}
        process.exitCode = 1;

    } finally {
        // close() finaliza y escribe los archivos .webm
        await passengerCtx.close();
        await driverCtx.close();
        await browser.close();

        console.log(`\n🎥 Videos en: ${path.resolve(VIDEO_DIR)}/`);
        console.log('');
        console.log('   Para unir (PowerShell):');
        console.log('   ffmpeg -i videos/demo/passenger.webm -i videos/demo/driver.webm `');
        console.log('     -filter_complex "[0:v][1:v]hstack=inputs=2" `');
        console.log('     -c:v libx264 -crf 17 vamo_demo_final.mp4');
        console.log('');
    }
}

runDemo();
