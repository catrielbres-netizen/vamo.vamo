import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function generatePDF() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Get absolute path to the HTML file
    const filePath = path.resolve('scripts/proposal_template.html');
    const fileUrl = `file://${filePath}`;
    
    console.log(`Loading template from: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    
    // Define output path in the artifacts directory
    const artifactsDir = 'C:\\Users\\catri\\.gemini\\antigravity\\brain\\96e70126-c4e7-4a62-8a6e-7765b6cc54a9';
    const outputPath = path.join(artifactsDir, 'proyecto_maestro_vamo_final.pdf');
    
    console.log(`Generating PDF to: ${outputPath}`);
    
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '0mm',
            right: '0mm',
            bottom: '0mm',
            left: '0mm'
        }
    });
    
    await browser.close();
    console.log('PDF Generated successfully.');
}

generatePDF().catch(err => {
    console.error('Error generating PDF:', err);
    process.exit(1);
});
