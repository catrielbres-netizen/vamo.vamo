import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'vamo2024pass';

const accounts = [
    { name: 'Municipal', email: 'demo.municipal@vamo.test', path: '/login/municipal', waitUrl: '/municipal' },
    { name: 'Tránsito', email: 'demo.transito@vamo.test', path: '/login/transito', waitUrl: '/traffic' },
    { name: 'Conductor', email: 'demo.driver@vamo.test', path: '/driver/login', waitUrl: '/driver' },
    { name: 'Pasajero', email: 'demo.passenger@vamo.test', path: '/login', waitUrl: '/dashboard' },
    { name: 'Superadmin', email: 'demo.superadmin@vamo.test', path: '/login', waitUrl: '/admin' }
];

async function runQA() {
    console.log('Iniciando QA...');
    const browser = await chromium.launch({ headless: true });

    for (const acc of accounts) {
        console.log(`\nProbando ${acc.name}...`);
        const ctx = await browser.newContext();
        const page = await ctx.newPage();

        try {
            await page.goto(`${BASE_URL}${acc.path}`, { waitUntil: 'domcontentloaded' });
            await page.fill('input[type="email"], #email', acc.email);
            await page.fill('input[type="password"], #password', PASSWORD);
            await page.click('button[type="submit"], button:has-text("Iniciar Sesión"), button:has-text("ACCEDER AL CONTROL")');

            await page.waitForURL(new RegExp(acc.waitUrl), { timeout: 15000 });
            console.log(`✅ [${acc.name}] Redirección exitosa a ${acc.waitUrl}`);
            
            // Wait for some content to load to avoid blank screen
            await page.waitForSelector('h1, h2, canvas, .lucide, [role="tab"], #online-toggle', { timeout: 10000 });
            console.log(`✅ [${acc.name}] Pantalla cargada (no blank screen)`);
            
        } catch (e: any) {
            console.error(`❌ [${acc.name}] Error: ${e.message}`);
        } finally {
            await ctx.close();
        }
    }
    
    await browser.close();
    console.log('QA finalizado.');
    process.exit(0);
}

runQA();
