// Genera iconos PNG y la imagen OG desde SVG (sharp ya viene con Astro). Uso: node scripts-iconos.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url));
await sharp(svg, { density: 600 }).resize(192, 192).png().toFile('public/icono-192.png');
await sharp(svg, { density: 900 }).resize(512, 512).png().toFile('public/icono-512.png');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#171b24"/>
<rect x="60" y="60" width="1080" height="510" rx="40" fill="#1f2430" stroke="#343b48" stroke-width="2"/>
<text x="120" y="250" font-family="Segoe UI, Inter, sans-serif" font-size="78" font-weight="700" fill="#eef0f4">La Barbería Estadio</text>
<text x="120" y="330" font-family="Segoe UI, Inter, sans-serif" font-size="38" fill="#9aa2b1">Reserva en tiempo real · Mira quién está libre en 3D</text>
<text x="120" y="420" font-family="Segoe UI, Inter, sans-serif" font-size="34" fill="#8b9bf7">Yape · Plin · Tarjeta de lealtad</text></svg>`;
const icono = await sharp(svg, { density: 900 }).resize(260, 260).png().toBuffer();
await sharp(Buffer.from(og)).composite([{ input: icono, left: 860, top: 185 }]).png().toFile('public/og.png');
console.log('iconos OK');
