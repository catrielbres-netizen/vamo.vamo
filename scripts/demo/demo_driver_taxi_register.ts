/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  VamO — Demo REGISTRO CONDUCTOR TAXI · v6 (viewport = video, ffmpeg ×2)
 *  Salida final: VAMO_DEMO_02_REGISTRO_TAXI.webm · 1080×1920
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  POR QUÉ ESTO FUNCIONA:
 *    Playwright NO upscalea el viewport al grabar. Si viewport < recordVideo,
 *    rellena el frame sobrante con gris. La única forma de llenar el frame:
 *
 *      viewport = recordVideo  →  grabar en 540×960 (mobile CSS < 768px)
 *      ffmpeg  ×2              →  escalar a 1080×1920 (final entregable)
 *
 *  DEPENDENCIAS: ffmpeg en PATH (ya instalado en el proyecto)
 *
 *  USO:  npm run demo:driver-taxi-register
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { chromium, Page } from 'playwright';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL  = (process.env.VAMO_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const VIDEO_DIR = 'videos/demo';
const OUT_NAME  = 'VAMO_DEMO_02_REGISTRO_TAXI';

const timestamp = Date.now();
const NEW_EMAIL = process.env.DEMO_DRIVER_NEW_EMAIL || `demo.taxi.${timestamp}@vamo.com`;
const NEW_PASS  = process.env.DEMO_DRIVER_NEW_PASS  || 'VamO2024demo!';

// ─── Dimensiones ───────────────────────────────────────────────────────────────
// Viewport = Video = 540×960  →  sin padding gris, llenado completo
// Post-proceso ffmpeg ×2     →  1080×1920 final
const REC_W = 540;   // viewport y video de grabación
const REC_H = 960;
const OUT_W = 1080;  // output final post-ffmpeg
const OUT_H = 1920;

// ─── Timing ────────────────────────────────────────────────────────────────────
const T = {
    HOVER:       450,
    TYPE_DELAY:   65,
    AFTER_FIELD: 700,
    SECTION:    1300,
    FOCUS:      1800,
} as const;

const beat = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Scroll suave por pasos ────────────────────────────────────────────────────
async function scrollDown(page: Page, px: number) {
    const steps = Math.ceil(px / 60);
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, 60);
        await beat(65);
    }
    await beat(300);
}

// ─── Fill por placeholder ──────────────────────────────────────────────────────
async function fill(page: Page, placeholder: string, text: string) {
    const el = page.locator(`input[placeholder="${placeholder}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 10000 });
    await el.click();
    await beat(200);
    await el.pressSequentially(text, { delay: T.TYPE_DELAY });
    await beat(T.AFTER_FIELD);
}

// ─── Select Radix por índice (0=vehicleType, 1=carModelYear) ──────────────────
async function selectOption(page: Page, index: 0 | 1, optionText: string) {
    const trigger = page.locator('[role="combobox"]').nth(index);
    await trigger.waitFor({ state: 'visible', timeout: 8000 });
    await trigger.hover();
    await beat(T.HOVER);
    await trigger.click();
    await beat(900);
    const opt = page.locator(`[role="option"]:has-text("${optionText}")`).first();
    await opt.waitFor({ state: 'visible', timeout: 5000 });
    await opt.click();
    await beat(T.AFTER_FIELD);
}

// ─── Post-proceso: ffmpeg escala 540×960 → 1080×1920 ──────────────────────────
function upscaleWithFfmpeg(inputPath: string, outputPath: string): boolean {
    try {
        execSync(`ffmpeg -y -i "${inputPath}" -vf scale=${OUT_W}:${OUT_H}:flags=lanczos -c:v libvpx-vp9 -b:v 2M "${outputPath}" 2>&1`, {
            timeout: 120000,
        });
        return true;
    } catch (e: any) {
        console.warn('  ⚠  ffmpeg no disponible o falló. El video queda en 540×960.');
        console.warn('     Escalá manualmente con:');
        console.warn(`     ffmpeg -i "${inputPath}" -vf scale=1080:1920 "${outputPath}"`);
        return false;
    }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────────
async function runDriverTaxiDemo() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  VamO — Demo 02: Registro Conductor Taxi v6              ║');
    console.log('║  540×960 grabación → ffmpeg ×2 → 1080×1920 final        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  EMAIL : ${NEW_EMAIL}`);
    console.log('');

    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-notifications'],
    });

    // viewport = recordVideo → frame lleno sin padding gris
    const ctx = await browser.newContext({
        viewport:    { width: REC_W, height: REC_H },
        recordVideo: { dir: VIDEO_DIR, size: { width: REC_W, height: REC_H } },
    });

    const page: Page = await ctx.newPage();
    let rawVideoPath = '';

    try {
        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 1 — Formulario /driver/register
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 1: /driver/register ─────────────────────────────');

        await page.goto(`${BASE_URL}/driver/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.locator('input[placeholder="Nombre y Apellido"]').waitFor({ state: 'visible', timeout: 15000 });

        // Pausa introductoria — "VamO DRIVE" visible
        await beat(T.FOCUS);

        // Scroll inicial: saltar espacio vacío del header centrado
        console.log('  → Centrando formulario…');
        await scrollDown(page, 200);
        await beat(T.SECTION);

        // NOMBRE
        console.log('  → Nombre y Apellido…');
        await fill(page, 'Nombre y Apellido', 'Carlos Romero');
        await scrollDown(page, 90);
        await beat(350);

        // EMAIL
        console.log('  → Email…');
        await fill(page, 'Email', NEW_EMAIL);

        // TELÉFONO
        console.log('  → Teléfono…');
        await fill(page, 'Teléfono (WhatsApp)', '2804561234');
        await scrollDown(page, 90);
        await beat(350);

        // CONTRASEÑA
        console.log('  → Contraseña…');
        await fill(page, 'Contraseña (mínimo 6 caracteres)', NEW_PASS);
        await scrollDown(page, 110);
        await beat(T.SECTION);

        // GÉNERO
        console.log('  → Género: Hombre…');
        const hombreBtn = page.locator('button[type="button"]:has-text("Hombre")').first();
        await hombreBtn.waitFor({ state: 'visible', timeout: 5000 });
        await hombreBtn.hover();
        await beat(T.HOVER);
        await hombreBtn.click();
        await beat(T.AFTER_FIELD);
        await scrollDown(page, 130);
        await beat(T.SECTION);

        // TIPO: Taxi (combobox[0])
        console.log('  → Tipo: Taxi…');
        await selectOption(page, 0, 'Taxi');

        // AÑO: 2020 (combobox[1])
        console.log('  → Año: 2020…');
        await selectOption(page, 1, '2020');
        await scrollDown(page, 110);
        await beat(T.SECTION);

        // PATENTE
        console.log('  → Patente…');
        await fill(page, 'Patente (Ej: AF123BC)', 'AB 234 CD');

        // LICENCIA
        console.log('  → N° Licencia…');
        await fill(page, 'N° Licencia', 'LC-0293847');
        await scrollDown(page, 120);
        await beat(T.SECTION);

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 2 — Botón "Registrarme como Conductor"
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 2: Confirmación ─────────────────────────────────');

        const submitBtn = page.locator('button[type="submit"]').first();
        await submitBtn.waitFor({ state: 'visible', timeout: 8000 });
        await beat(T.FOCUS);
        await submitBtn.hover();
        await beat(700);
        console.log('  → Enviando registro…');
        await submitBtn.click();

        // ════════════════════════════════════════════════════════════════════
        //  ESCENA 3 — Panel del conductor
        // ════════════════════════════════════════════════════════════════════
        console.log('\n── ESCENA 3: Panel del conductor ──────────────────────────');

        await page.waitForURL(
            /\/(auth\/continue|driver\/rides|driver\/complete-profile\/verify)$/,
            { timeout: 25000 }
        );
        console.log(`  ✅ → ${page.url()}`);
        await beat(T.FOCUS);

        if (page.url().includes('auth/continue')) {
            await page.waitForURL(/\/driver\/rides$/, { timeout: 15000 });
            console.log(`  ✅ Panel: ${page.url()}`);
        }

        await beat(T.FOCUS);
        await scrollDown(page, 120);
        await beat(2500);

        console.log('\n  ✅ DEMO COMPLETADA. Email:', NEW_EMAIL);

    } catch (err: any) {
        console.error('\n❌ Error:', err.message || err);
        try {
            const errDir = path.join(VIDEO_DIR, 'debug');
            if (!fs.existsSync(errDir)) fs.mkdirSync(errDir, { recursive: true });
            await page.screenshot({ path: path.join(errDir, 'err_driver_taxi.png'), fullPage: true });
            console.log('  📸 → videos/demo/debug/err_driver_taxi.png');
        } catch (_) {}
        process.exitCode = 1;

    } finally {
        // Cerrar el contexto → escribe el .webm
        const videoObj = await page.video();
        await ctx.close();
        await browser.close();

        // Encontrar el .webm recién generado
        rawVideoPath = videoObj ? (await videoObj.path() || '') : '';
        if (!rawVideoPath || !fs.existsSync(rawVideoPath)) {
            // Fallback: buscar el más reciente
            const files = fs.readdirSync(VIDEO_DIR)
                .filter(f => f.endsWith('.webm') && !f.startsWith('VAMO_DEMO'))
                .sort((a, b) =>
                    fs.statSync(path.join(VIDEO_DIR, b)).mtimeMs -
                    fs.statSync(path.join(VIDEO_DIR, a)).mtimeMs
                );
            if (files.length > 0) rawVideoPath = path.join(VIDEO_DIR, files[0]);
        }

        if (!rawVideoPath || !fs.existsSync(rawVideoPath)) {
            console.error('❌ No se encontró el archivo de video grabado.');
            return;
        }

        console.log(`\n📹 Grabación en bruto (540×960): ${rawVideoPath}`);

        // ── Escalar con ffmpeg a 1080×1920 ────────────────────────────────
        const finalPath = path.join(VIDEO_DIR, `${OUT_NAME}.webm`);
        console.log(`🔧 Escalando a 1080×1920 con ffmpeg…`);

        const ok = upscaleWithFfmpeg(rawVideoPath, finalPath);

        if (ok) {
            // Eliminar el archivo intermedio
            try { fs.unlinkSync(rawVideoPath); } catch (_) {}
            console.log(`\n🎥 Video final → ${finalPath}`);
            console.log(`   Resolución: ${OUT_W}×${OUT_H} · Mobile layout\n`);
        } else {
            // Si ffmpeg no está, renombrar el 540×960 al nombre final
            try {
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                fs.renameSync(rawVideoPath, finalPath);
            } catch (_) {}
            console.log(`\n🎥 Video (540×960) → ${finalPath}\n`);
        }
    }
}

runDriverTaxiDemo();
