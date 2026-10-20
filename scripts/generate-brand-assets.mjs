import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets/branding');
const app = path.join(root, 'apps/sweetspot');
const docs = path.join(root, 'apps/docs/public');
const icon = await readFile(path.join(brand, 'app-icon.svg'));
const mark = await readFile(path.join(brand, 'mark.svg'), 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
async function save(relative, data) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}
const raster = new Map();
for (const size of sizes) {
  const png = await sharp(icon).resize(size, size).png().toBuffer();
  raster.set(size, png);
  await save(`apps/sweetspot/build/${size}x${size}.png`, png);
  await save(`apps/sweetspot/src/renderer/src/assets/icons/png/${size}x${size}.png`, png);
}
for (const relative of ['apps/sweetspot/src/renderer/src/assets/logo.svg', 'apps/docs/public/logo.svg', 'apps/docs/public/images/logo.svg']) await save(relative, icon);
for (const relative of ['apps/sweetspot/src/renderer/src/assets/logo.png', 'apps/sweetspot/build/icon.png', 'assets/branding/app-icon.png']) await save(relative, raster.get(1024));
await writeFile(path.join(docs, 'logo.png'), raster.get(256));

// ICO directory followed by lossless PNG frames (Windows Vista and newer).
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const directory = Buffer.alloc(6 + 16 * icoSizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(icoSizes.length, 4);
let offset = directory.length;
icoSizes.forEach((size, index) => {
  const data = raster.get(size), entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
const ico = Buffer.concat([directory, ...icoSizes.map(size => raster.get(size))]);
for (const relative of ['apps/sweetspot/build/icon.ico', 'apps/sweetspot/build/favicon.ico', 'apps/sweetspot/resources/favicon.ico', 'apps/sweetspot/src/renderer/src/assets/icons/win/icon.ico', 'apps/docs/public/favicon.ico']) await save(relative, ico);

// Modern ICNS PNG elements, including Retina representations; portable generation.
const icnsTypes = [['icp4',16], ['icp5',32], ['icp6',64], ['ic07',128], ['ic08',256], ['ic09',512], ['ic10',1024], ['ic11',32], ['ic12',64], ['ic13',256], ['ic14',512]];
const elements = icnsTypes.map(([type,size]) => {
  const image = raster.get(size), header = Buffer.alloc(8);
  header.write(type); header.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([header,image]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8 + elements.reduce((sum,data) => sum + data.length,0),4);
const icns = Buffer.concat([icnsHeader,...elements]);
for (const relative of ['apps/sweetspot/build/icon.icns', 'apps/sweetspot/src/renderer/src/assets/icons/mac/icon.icns']) await save(relative, icns);

// Keep the aperture mask: its transparent centre is essential at tray sizes.
const monochrome = await readFile(path.join(brand, 'mark-mono.svg'), 'utf8');
const traySvg = monochrome.replace('viewBox="0 0 512 512"','viewBox="108 108 296 296"');
for (const size of [16,32]) await save(`apps/sweetspot/build/trayTemplate${size === 32 ? '@2x' : ''}.png`, await sharp(Buffer.from(traySvg)).resize(size,size,{fit:'contain'}).png().toBuffer());

const inner = icon.toString().replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
const { colors, palette, tagline, descriptor } = JSON.parse(await readFile(path.join(brand, 'identity.json'), 'utf8'));
const dark = colors.ink, ivory = colors.paper, amber = colors.accent, copper = colors.muted;
const svg = (body, width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`;
const strip = value => value.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
for (const mode of ['dark','light']) {
  const word = await readFile(path.join(brand, `wordmark-${mode}.svg`), 'utf8');
  const lockup = await readFile(path.join(brand, `wordmark-on-${mode}.svg`), 'utf8');
  await save(`assets/branding/wordmark-${mode}.png`, await sharp(Buffer.from(word)).resize(1960,480).png().toBuffer());
  await save(`assets/branding/wordmark-on-${mode}.png`, await sharp(Buffer.from(lockup)).resize(1380,300).png().toBuffer());
  // Tight optical bounds keep the wordmark centered beside icons and nav labels.
  const siteWordmark = word.replace('width="980" height="240" viewBox="0 0 980 240"', 'width="920" height="160" viewBox="30 29 920 160"');
  await save(`apps/docs/public/images/wordmark-${mode}.svg`, siteWordmark);
}
const word = await readFile(path.join(brand, 'wordmark-dark.svg'), 'utf8');
await save('apps/sweetspot/src/renderer/src/assets/wordmark.svg', word.replaceAll(ivory,'currentColor'));
const symbol = strip(mark).replaceAll(ivory, amber);
const artwork = svg(`<rect width="1600" height="900" fill="${dark}"/><g transform="translate(650 -80) scale(2.2)">${symbol}</g>`,1600,900);
await save('assets/branding/hi-fi-art.svg', artwork);
await save('assets/branding/hi-fi-art.png', await sharp(Buffer.from(artwork)).png().toBuffer());
await save('apps/docs/public/images/sweetspot-sound.webp', await sharp(Buffer.from(artwork)).webp({quality:90}).toBuffer());
const banner = svg(`<rect width="1200" height="630" fill="${dark}"/><g transform="translate(870 20) scale(.5)">${symbol}</g><g transform="translate(55 225) scale(1.05)">${strip(word)}</g><text x="85" y="500" font-family="Inter,Arial,sans-serif" font-size="34" fill="${ivory}">${tagline}</text><text x="85" y="562" font-family="Inter,Arial,sans-serif" font-size="20" fill="${ivory}">${descriptor}</text>`,1200,630);
await save('apps/docs/public/images/sweetspot-banner.svg',banner);
const bannerPng = await sharp(Buffer.from(banner)).png().toBuffer();
await save('apps/docs/public/images/opengraph-banner.png',bannerPng);
await save('assets/branding/social-card.svg',banner);
await save('assets/branding/social-card.png',bannerPng);
await save('screenshots/banner.jpg',await sharp(bannerPng).jpeg({quality:94}).toBuffer());

const label = (text,x,y,size=22) => `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="${copper}">${text}</text>`;
const sheet = Buffer.from(svg(`<rect width="1400" height="1300" fill="${dark}"/>${label('SWEET SPOT · PARKINSANS 600 / QUIET APERTURE',60,54,19)}${label('App icon',60,422)}${label('Wordmarks',430,95)}<rect x="420" y="120" width="920" height="235" rx="24" fill="${ivory}"/>${label('Small-size exports',60,644)}${label('Menu-bar template',825,644)}<rect x="810" y="664" width="530" height="125" rx="20" fill="${ivory}"/>${label('Share artwork',60,849)}`,1400,1300));
const review = [
  {input:await sharp(icon).resize(280,280).toBuffer(),left:60,top:100},
  {input:await sharp(path.join(brand,'wordmark-on-light.png')).resize(790,172).toBuffer(),left:450,top:152},
  {input:await sharp(path.join(brand,'wordmark-on-dark.png')).resize(790,172).toBuffer(),left:450,top:405},
  {input:await sharp(path.join(app,'build/trayTemplate@2x.png')).resize(64,64).toBuffer(),left:844,top:695},
  {input:await sharp(bannerPng).resize(730,383).toBuffer(),left:60,top:884},
  {input:await sharp(Buffer.from(artwork)).resize(500,383,{fit:'cover'}).toBuffer(),left:830,top:884},
];
let cursor=64;
for(const size of [16,32,64,128]) {review.push({input:raster.get(size),left:cursor,top:664+Math.round((128-size)/2)});cursor+=size+45;}
await save('assets/branding/brand-preview.png',await sharp(sheet).composite(review).png().toBuffer());
console.log('Generated the selected Parkinsans 600 / Quiet Aperture identity across all app and docs artwork.');

const paletteCard = svg(`<rect width="1400" height="740" fill="${dark}"/><text x="60" y="65" font-family="Arial,sans-serif" font-size="24" fill="${ivory}">SWEET SPOT · ${palette.toUpperCase().replaceAll('&','&amp;')}</text><g transform="translate(60 170) scale(.44)">${inner}</g><g transform="translate(340 175)">${strip(word)}</g><text x="374" y="450" font-family="Arial,sans-serif" font-size="30" fill="${ivory}">${tagline}</text><rect y="530" width="1400" height="210" fill="${ivory}"/>${[['Ink',dark],['Warm white',ivory],['Crimson',amber],['Warm gray',copper]].map(([name,color],i)=>`<rect x="${60+i*330}" y="580" width="60" height="60" rx="14" fill="${color}" stroke="${dark}" stroke-opacity=".12"/><text x="${138+i*330}" y="605" font-family="Arial,sans-serif" font-size="23" fill="${dark}">${name}</text><text x="${138+i*330}" y="635" font-family="Arial,sans-serif" font-size="18" fill="${dark}">${color}</text>`).join('')}`,1400,740);
await save('assets/branding/palette-preview.svg',paletteCard);
await save('assets/branding/palette-preview.png',await sharp(Buffer.from(paletteCard)).png().toBuffer());
