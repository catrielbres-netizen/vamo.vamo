const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const inputImagePath = path.join(__dirname, '../public/branding/vamo-logo-oficial-1x1.png');

async function generate() {
  console.log('Generando iconos a partir del logo oficial con Jimp...');
  
  const image = await Jimp.read(inputImagePath);

  // 192x192
  const img192 = image.clone();
  img192.resize({ w: 192, h: 192 });
  await img192.write(path.join(__dirname, '../public/branding/icon-192.png'));
  console.log('Generado icon-192.png');

  // 512x512
  const img512 = image.clone();
  img512.resize({ w: 512, h: 512 });
  await img512.write(path.join(__dirname, '../public/branding/icon-512.png'));
  console.log('Generado icon-512.png');

  // apple-touch-icon 180x180
  const img180 = image.clone();
  img180.resize({ w: 180, h: 180 });
  await img180.write(path.join(__dirname, '../public/apple-touch-icon.png'));
  console.log('Generado apple-touch-icon.png');

  // favicon (32x32)
  const img32 = image.clone();
  img32.resize({ w: 32, h: 32 });
  await img32.write(path.join(__dirname, '../public/favicon.png'));
  
  fs.copyFileSync(path.join(__dirname, '../public/favicon.png'), path.join(__dirname, '../src/app/favicon.ico'));
  fs.copyFileSync(path.join(__dirname, '../public/favicon.png'), path.join(__dirname, '../public/favicon.ico'));
  console.log('Generado favicon.png y reemplazado src/app/favicon.ico y public/favicon.ico');
  
  fs.copyFileSync(path.join(__dirname, '../public/apple-touch-icon.png'), path.join(__dirname, '../src/app/apple-icon.png'));

  console.log('Iconos generados exitosamente.');
}

generate().catch(console.error);
