/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  VamO — Demo Registro de Pasajero · ~60 segundos · v2
 *  Formato: vertical 1080×1920 (móvil)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  FLUJO:
 *    1. /login         → email + contraseña + "REGISTRARME COMO PASAJERO"
 *    2. /auth/continue → loader automático
 *    3. /dashboard/complete-profile → scroll progresivo campo a campo
 *    4. /dashboard/ride → cierre dentro de la app
 *
 *  MEJORAS v2:
 *    - Scroll suave antes de cada campo (scrollIntoViewIfNeeded)
 *    - Avatar inyectado y esperado antes de continuar con el form
 *    - Recorrido visual de arriba hacia abajo, nada fuera de pantalla
 *    - Botón final visible y con hover claro antes del click
 *
 *  USO:  npm run demo:register
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { chromium, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL  = (process.env.VAMO_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const VIDEO_DIR = 'videos/demo';
const timestamp = Date.now();
const NEW_EMAIL = process.env.DEMO_NEW_EMAIL || `demo.pasajero.${timestamp}@vamo.com`;
const NEW_PASS  = process.env.DEMO_NEW_PASS  || 'VamO2024demo!';
const W = 1080;
const H = 1920;

// ─── Timing ────────────────────────────────────────────────────────────────────
const T = {
    HOVER:       450,
    TYPE_DELAY:   65,
    AFTER_FIELD: 700,
    SECTION:    1400,
    FOCUS:      2000,
    SCROLL_STEP: 100, // px por paso en scroll manual
} as const;

const beat = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Scroll suave hasta un elemento ───────────────────────────────────────────

/**
 * Hace scroll suave hasta que el elemento quede centrado en pantalla,
 * luego espera que sea visible antes de interactuar.
 */
async function scrollToField(page: Page, selector: string) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'attached', timeout: 10000 });
    // scrollIntoViewIfNeeded es suave y nativo del browser
    await el.scrollIntoViewIfNeeded();
    await beat(500); // esperar que la animación de scroll asiente
}

/** Scroll manual suave hacia abajo — para recorrer el formulario visualmente */
async function smoothScroll(page: Page, direction: 'down' | 'up', totalPx: number) {
    const sign  = direction === 'down' ? 1 : -1;
    const steps = Math.ceil(totalPx / T.SCROLL_STEP);
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, sign * T.SCROLL_STEP);
        await beat(80);
    }
    await beat(350);
}

// ─── demoFill: scroll + fill con typing visible ────────────────────────────────

async function demoFill(page: Page, selector: string, text: string) {
    await scrollToField(page, selector);
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 10000 });
    await el.click();
    await beat(250);
    await el.pressSequentially(text, { delay: T.TYPE_DELAY });
    await beat(T.AFTER_FIELD);
}

// ─── demoClick: scroll + hover + click ────────────────────────────────────────

async function demoClick(page: Page, selector: string, timeout = 12000) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout });
    await el.scrollIntoViewIfNeeded();
    await beat(400);
    await el.hover();
    await beat(T.HOVER);
    await el.click();
}

// ─── Avatar: generar PNG en canvas e inyectar en el input[type=file] ──────────

async function injectAndWaitAvatar(page: Page) {
    // 1. Generar PNG en memoria
    const base64Png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 200;
        const ctx = canvas.getContext('2d')!;
        const g = ctx.createLinearGradient(0, 0, 200, 200);
        g.addColorStop(0, '#6366f1');
        g.addColorStop(1, '#4338ca');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(100, 100, 100, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 72px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('JD', 100, 108);
        return canvas.toDataURL('image/png').split(',')[1];
    });

    // 2. Inyectar vía DataTransfer sin abrir diálogo
    await page.evaluate((b64) => {
        const bytes  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const file   = new File([bytes], 'avatar_demo.png', { type: 'image/png' });
        const input  = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (!input) throw new Error('input[type=file] no encontrado');
        const dt = new DataTransfer();
        dt.items.add(file);
        Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, base64Png);

    // 3. Esperar que el avatar aparezca en la UI (Firebase Storage upload puede tardar)
    //    Se detecta cuando el AvatarImage tiene src distinto de vacío,
    //    o cuando el spinner desaparece, o simplemente esperamos el tiempo del upload.
    console.log('    → Esperando que se procese el avatar (upload a Firebase Storage)…');
    await beat(5000); // tiempo realista para upload en dev
}

// ─── MAIN ───────────────────────────────────────────────────────────────────────

async function runRegistrationDemo() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  VamO — Demo Registro de Pasajero v2         ║');
    console.log('║  Formato: 1080×1920 · scroll visual completo ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(`  BASE_URL : ${BASE_URL}`);
    console.log(`  EMAIL    : ${NEW_EMAIL}`);
    console.log('');

    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless: false,
        slowMo:   20,
        args: ['--disable-notifications', '--disable-infobars'],
    });

    const ctx = await browser.newContext({
        viewport:    { width: W, height: H },
        recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
    });

    const page: Page = await ctx.newPage();

    try {

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 1 — Pantalla de login completa
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 1: Login ───────────────────────────────────');
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Esperar que el Card de login sea visible
        await page.locator('#email').waitFor({ state: 'visible', timeout: 15000 });

        // Pausa — espectador ve el logo VamO y el formulario completo
        await beat(T.FOCUS);

        // Email
        console.log('  → Email…');
        await page.locator('#email').click();
        await beat(300);
        await page.locator('#email').pressSequentially(NEW_EMAIL, { delay: T.TYPE_DELAY });
        await beat(T.AFTER_FIELD);

        // Contraseña
        console.log('  → Contraseña…');
        await page.locator('#password').click();
        await beat(300);
        await page.locator('#password').pressSequentially(NEW_PASS, { delay: T.TYPE_DELAY });
        await beat(T.SECTION);

        // Separador visible + zona de registro
        // Hacer scroll suave para mostrar el botón "REGISTRARME" que está abajo del separador
        console.log('  → Scrolleando para mostrar la sección de registro…');
        await smoothScroll(page, 'down', 300);
        await beat(T.SECTION);

        // Click en "REGISTRARME COMO PASAJERO" — ahora visible
        console.log('  → Clic en "REGISTRARME COMO PASAJERO"…');
        await demoClick(page, 'button:has-text("REGISTRARME COMO PASAJERO")');

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 2 — Loader /auth/continue (automático)
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 2: Redirigiendo… ───────────────────────────');
        await page.waitForURL(/complete-profile/, { timeout: 25000 });
        console.log('  ✅ /dashboard/complete-profile');
        await beat(T.FOCUS); // mostrar el formulario vacío por un momento

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 3 — Completar perfil con scroll visual progresivo
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 3: Completar perfil (scroll progresivo) ────');

        // — 3a. Zona superior: avatar ————————————————————————————————————
        // El avatar se ve arriba — inyectar mientras está a la vista
        console.log('  → Foto de perfil (zona superior, visible)…');
        await injectAndWaitAvatar(page);
        await beat(T.SECTION);

        // Pausa para que el espectador vea el avatar cargado
        await beat(1000);

        // — 3b. Nombre ————————————————————————————————————————————————————
        console.log('  → Nombre…');
        await demoFill(page, 'input[placeholder="Juan"]', 'Juan');

        // — 3c. Apellido ——————————————————————————————————————————————————
        console.log('  → Apellido…');
        await demoFill(page, 'input[placeholder="Pérez"]', 'Díaz');

        // Scroll suave después del primer par de campos: ver el resto del formulario
        console.log('  → Scrolleando para ver campos siguientes…');
        await smoothScroll(page, 'down', 350);
        await beat(T.SECTION);

        // — 3d. Nombre visible ————————————————————————————————————————————
        console.log('  → Nombre visible para conductores…');
        await demoFill(page, 'input[placeholder="Juan P."]', 'Juan D.');

        // — 3e. Teléfono ——————————————————————————————————————————————————
        console.log('  → Teléfono…');
        await demoFill(page, 'input[placeholder="2804123456"]', '2804987654');

        // Scroll para mostrar género y referido
        console.log('  → Scrolleando para ver Género y código de referido…');
        await smoothScroll(page, 'down', 350);
        await beat(T.SECTION);

        // — 3f. Género (Select de Radix) ——————————————————————————————————
        console.log('  → Género…');
        const genderTrigger = page.locator(
            '[role="combobox"]'
        ).first();
        if (await genderTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
            await genderTrigger.scrollIntoViewIfNeeded();
            await beat(400);
            await genderTrigger.hover();
            await beat(T.HOVER);
            await genderTrigger.click();
            await beat(900); // animación del dropdown
            const opt = page.locator('[role="option"]:has-text("Hombre")').first();
            if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
                await opt.click();
            }
            await beat(T.AFTER_FIELD);
        }

        // Scroll final para mostrar el botón "Guardar y Empezar"
        console.log('  → Scrolleando para mostrar el botón final…');
        await smoothScroll(page, 'down', 400);
        await beat(T.SECTION);

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 4 — Botón visible → Guardar y Empezar
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 4: Guardar y entrar ────────────────────────');

        const guardarBtn = page.locator('button:has-text("Guardar y Empezar")').first();
        await guardarBtn.waitFor({ state: 'visible', timeout: 10000 });
        await guardarBtn.scrollIntoViewIfNeeded();

        // Pausa — el espectador lee el botón antes del click
        await beat(T.FOCUS);

        await guardarBtn.hover();
        await beat(700);
        await guardarBtn.click();
        console.log('  → Guardando perfil…');

        // Esperar dashboard
        await page.waitForURL(/\/dashboard\/ride/, { timeout: 30000 });
        console.log('  ✅ Dashboard /dashboard/ride');

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 5 — Dashboard del pasajero (cierre)
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 5: Dashboard (cierre) ──────────────────────');

        await beat(T.FOCUS); // dashboard cargando

        // Scroll suave para mostrar el contenido del dashboard
        await smoothScroll(page, 'down', 300);
        await beat(2000);

        // Subir de nuevo para terminar con la app centrada
        await smoothScroll(page, 'up', 200);
        await beat(2500); // pausa de cierre

        console.log('\n  ✅ DEMO DE REGISTRO COMPLETADA.');
        console.log(`     Email: ${NEW_EMAIL}`);

    } catch (err: any) {
        console.error('\n❌ Error:', err.message || err);
        try {
            const errDir = path.join(VIDEO_DIR, 'debug');
            if (!fs.existsSync(errDir)) fs.mkdirSync(errDir, { recursive: true });
            await page.screenshot({ path: path.join(errDir, 'error_register.png'), fullPage: true });
            console.log('  📸 Screenshot → videos/demo/debug/');
        } catch (_) {}
        process.exitCode = 1;

    } finally {
        await ctx.close(); // guarda el .webm
        await browser.close();
        console.log(`\n🎥 Video → ${path.resolve(VIDEO_DIR)}/\n`);
    }
}

runRegistrationDemo();
