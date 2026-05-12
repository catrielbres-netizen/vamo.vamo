import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function generatePDF() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Get absolute path to the HTML file
    const filePath = path.resolve('scripts/trelew_proposal_template.html');
    const fileUrl = `file://${filePath}`;
    
    console.log(`Loading template from: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    
    // Define output path in the workspace for easy access
    const outputPath = path.resolve('Proyecto_VamO_Trelew_Profesional.pdf');
    
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
    console.log('PDF Generated successfully at: ' + outputPath);
}

generatePDF().catch(err => {
    console.error('Error generating PDF:', err);
    process.exit(1);
});
