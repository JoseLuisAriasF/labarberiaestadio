import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Download, Globe, LocateFixed, QrCode, Save, Trash2, Upload } from 'lucide-react';
import { msg, subirImagen, supabase } from '@/lib/supabase';
import type { Barberia, Horario } from '@/lib/tipos';
import EditorHorario from '../Horario';
import { Aviso, CampoImagen } from '../ui';
import { staff } from './Equipo';

const ICONO = L.divIcon({ html: '<div style="font-size:32px;line-height:1;filter:drop-shadow(0 2px 3px #0008)">💈</div>', className: '', iconSize: [32, 32], iconAnchor: [16, 30] });

/** Datos del local. La ubicación se fija como en Papichulo: marcador arrastrable,
    buscador de direcciones y GPS. Con ella "Cómo llegar" traza la ruta al cliente. */
export default function Local({ barberia, recargar }: { barberia: Barberia; recargar: () => void }) {
  const [b, setB] = useState(barberia);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const div = useRef<HTMLDivElement>(null);
  const marcador = useRef<L.Marker | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const set = <K extends keyof Barberia>(k: K, v: Barberia[K]) => setB((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const centro: [number, number] = [barberia.lat ?? -12.0675, barberia.lng ?? -77.0337];
    const m = L.map(div.current!).setView(centro, barberia.lat ? 17 : 13);
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(m);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
    L.control.layers({ Calles: calles, Satélite: sat }, undefined, { position: 'topright' }).addTo(m);
    const mk = L.marker(centro, { draggable: true, icon: ICONO }).addTo(m).bindPopup('Tu local (arrástrame)');
    const fijar = (ll: L.LatLng) => { mk.setLatLng(ll); setB((x) => ({ ...x, lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) })); };
    mk.on('dragend', () => fijar(mk.getLatLng()));
    m.on('click', (e: L.LeafletMouseEvent) => fijar(e.latlng));
    marcador.current = mk; mapa.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); };
  }, []);

  function mover(lat: number, lng: number) {
    const ll = L.latLng(lat, lng);
    marcador.current?.setLatLng(ll); mapa.current?.setView(ll, 18);
    setB((x) => ({ ...x, lat: +lat.toFixed(6), lng: +lng.toFixed(6) }));
  }
  async function buscar() {
    const q = [b.direccion, b.distrito, b.ciudad].filter(Boolean).join(', ');
    if (!q) return setError('Escribe la dirección primero');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => []);
    if (r[0]) mover(+r[0].lat, +r[0].lon); else setError('No encontramos la dirección. Ubica el marcador a mano.');
  }
  const gps = () => navigator.geolocation?.getCurrentPosition((p) => mover(p.coords.latitude, p.coords.longitude), () => setError('Sin permiso de ubicación'), { enableHighAccuracy: true });

  async function foto(archivo?: File, campo: 'fotos' | 'qr_pago_url' = 'fotos') {
    if (!archivo) return;
    try {
      const { url } = await subirImagen('publico', `${barberia.id}/local`, archivo);
      if (campo === 'fotos') set('fotos', [...(b.fotos ?? []), url].slice(0, 8)); else set('qr_pago_url', url);
    } catch (e) { setError(msg(e)); }
  }

  async function guardar() {
    setError(''); setOk('');
    const { error } = await supabase.from('barberias').update({
      nombre: b.nombre, descripcion: b.descripcion, telefono: b.telefono, whatsapp: b.whatsapp, email_contacto: b.email_contacto,
      direccion: b.direccion, referencia: b.referencia, distrito: b.distrito, ciudad: b.ciudad, lat: b.lat, lng: b.lng,
      horario: b.horario, fotos: b.fotos, yape_numero: b.yape_numero, plin_numero: b.plin_numero, titular_pago: b.titular_pago, qr_pago_url: b.qr_pago_url,
      logo_url: b.logo_url || null,
    }).eq('id', barberia.id);
    if (error) return setError(msg(error));
    setOk('Guardado ✅');
    recargar();
  }
  async function publicar() {
    try { await staff('publicar', { barberia_id: barberia.id }); setOk('Publicando… en 1-2 minutos Google verá los datos nuevos.'); }
    catch (e) { setError(msg(e)); }
  }

  const txt = (k: keyof Barberia, t: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label><span className="etiqueta">{t}</span><input className="campo" value={(b[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} {...extra} /></label>
  );

  return (
    <div className="grid gap-5">
      <section className="grid sm:grid-cols-2 gap-3">
        {txt('nombre', 'Nombre de la barbería', { required: true, maxLength: 80 })}
        {txt('telefono', 'Teléfono', { type: 'tel' })}
        {txt('whatsapp', 'WhatsApp (con 51)', { type: 'tel', placeholder: '51987654321' })}
        {txt('email_contacto', 'Correo de contacto', { type: 'email' })}
        <div className="grid gap-2 sm:col-span-2">
          <span className="etiqueta">Logo (se ve en la web y en el icono de la app). Pega un enlace https o sube una imagen.</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {txt('logo_url', 'Enlace del logo (https://…)', { placeholder: 'https://…' })}
            <CampoImagen texto="Subir logo" actual={b.logo_url}
              onChange={async (f) => { if (!f) return; try { const { url } = await subirImagen('publico', `${barberia.id}/logo`, f); set('logo_url', url); setOk('Logo subido. Guarda los cambios para publicarlo.'); } catch (e) { setError(msg(e)); } }} />
          </div>
        </div>
        <label className="sm:col-span-2"><span className="etiqueta">Descripción (sale en Google)</span>
          <textarea className="campo" rows={3} maxLength={600} value={b.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} /></label>
      </section>

      <section className="grid gap-3">
        <h3 className="titulo">📍 Ubicación del local</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {txt('direccion', 'Dirección exacta', { placeholder: 'Av. José Díaz 123' })}
          {txt('distrito', 'Distrito', { placeholder: 'Cercado de Lima' })}
          {txt('ciudad', 'Ciudad')}
          <div className="sm:col-span-3">{txt('referencia', 'Referencia', { placeholder: 'Frente al Estadio Nacional, puerta 4. 2º piso.' })}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={buscar}>🔍 Buscar dirección en el mapa</button>
          <button className="btn" onClick={gps}><LocateFixed className="size-4" /> Estoy en el local</button>
          <span className="text-xs text-base-500 self-center">{b.lat ? `${b.lat}, ${b.lng}` : 'Sin ubicación'} · arrastra el 💈 o toca el mapa</span>
        </div>
        <div ref={div} className="h-80 rounded-2xl neu-inset overflow-hidden z-0" />
      </section>

      <section className="grid gap-3">
        <h3 className="titulo">🕘 Horario general</h3>
        <EditorHorario valor={b.horario as Horario} onChange={(h) => set('horario', h)} />
      </section>

      <section className="grid gap-3">
        <h3 className="titulo">📸 Fotos del local</h3>
        <div className="flex flex-wrap gap-2">
          {(b.fotos ?? []).map((f) => (
            <div key={f} className="relative">
              <img src={f} alt="" className="size-24 rounded-xl object-cover" />
              <button className="absolute top-1 right-1 btn !p-1" aria-label="Quitar foto" onClick={() => set('fotos', b.fotos.filter((x) => x !== f))}><Trash2 className="size-3" /></button>
            </div>
          ))}
          <label className="size-24 rounded-xl neu-inset grid place-items-center cursor-pointer text-base-400"><Upload className="size-5" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => foto(e.target.files?.[0])} /></label>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="titulo">💜 Cobros por Yape / Plin (modo centralizado)</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {txt('yape_numero', 'Número Yape', { inputMode: 'tel' })}
          {txt('plin_numero', 'Número Plin', { inputMode: 'tel' })}
          {txt('titular_pago', 'Titular')}
        </div>
        <label className="btn w-fit cursor-pointer"><Upload className="size-4" /> {b.qr_pago_url ? 'Cambiar QR' : 'Subir QR de pago'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => foto(e.target.files?.[0], 'qr_pago_url')} /></label>
        {b.qr_pago_url && <img src={b.qr_pago_url} alt="QR" className="w-32 rounded-xl" />}
      </section>

      <section className="grid gap-3">
        <h3 className="titulo"><QrCode className="inline size-5" /> QR para reservas</h3>
        <p className="text-xs text-base-500">Imprime este QR y colócalo en el local. Los clientes lo escanean y van directo a reservar.</p>
        <QrBooking codigo={barberia.codigo} nombre={barberia.nombre} />
      </section>

      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="flex flex-wrap gap-2 sticky bottom-3">
        <button className="btn-acento" onClick={guardar}><Save className="size-4" /> Guardar cambios</button>
        <button className="btn" onClick={publicar} title="Regenera la web para Google con estos datos"><Globe className="size-4" /> Publicar en Google</button>
      </div>
    </div>
  );
}

function QrBooking({ codigo, nombre }: { codigo: string; nombre: string }) {
  const url = `${location.origin}/?b=${codigo}#reservar`;
  const svg = generarQR(url);
  const descargar = () => {
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.fillStyle = '#0e1117';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(nombre, size / 2, size - 20);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `qr-${codigo}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="neu rounded-2xl p-4 bg-white" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="grid gap-2 text-sm">
        <p className="font-mono text-xs text-base-400 break-all select-all">{url}</p>
        <button className="btn" onClick={descargar}><Download className="size-4" /> Descargar PNG (1024px)</button>
        <button className="btn" onClick={() => navigator.clipboard.writeText(url)}>📋 Copiar enlace</button>
      </div>
    </div>
  );
}

// QR Code generator — inline, no dependencies
// Generates a minimal QR Code SVG using alphanumeric mode
function generarQR(texto: string): string {
  const mods = qrEncode(texto);
  const n = mods.length;
  const cell = 4;
  const margin = 4;
  const size = (n + margin * 2) * cell;
  let rects = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (mods[y][x])
        rects += `<rect x="${(x + margin) * cell}" y="${(y + margin) * cell}" width="${cell}" height="${cell}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="200" height="200"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#0e1117">${rects}</g></svg>`;
}

// Minimal QR encoder (byte mode, error correction L, version auto-select)
function qrEncode(text: string): boolean[][] {
  const data = new TextEncoder().encode(text);
  const len = data.length;
  // Pick smallest version that fits (byte mode, EC level L)
  const caps = [0,17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858];
  let ver = 1;
  for (; ver <= 20; ver++) if (caps[ver] >= len) break;
  if (ver > 20) ver = 20;

  const n = 17 + ver * 4;
  const mods: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  const reserved: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

  // Finder patterns
  const finder = (r: number, c: number) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const y = r + dy, x = c + dx;
      if (y < 0 || y >= n || x < 0 || x >= n) continue;
      const on = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6 &&
        (dy === 0 || dy === 6 || dx === 0 || dx === 6 || (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4));
      mods[y][x] = on;
      reserved[y][x] = true;
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

  // Alignment patterns
  const aligns = alignPositions(ver);
  for (const ay of aligns) for (const ax of aligns) {
    if ((ay < 9 && ax < 9) || (ay < 9 && ax > n - 9) || (ay > n - 9 && ax < 9)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      mods[ay + dy][ax + dx] = Math.abs(dy) === 2 || Math.abs(dx) === 2 || (dy === 0 && dx === 0);
      reserved[ay + dy][ax + dx] = true;
    }
  }

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    mods[6][i] = mods[i][6] = i % 2 === 0;
    reserved[6][i] = reserved[i][6] = true;
  }

  // Reserve format & version areas
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = reserved[i][8] = true;
    if (i < 8) reserved[8][n - 1 - i] = true;
    if (i < 7) reserved[n - 1 - i][8] = true;
  }
  reserved[n - 8][8] = true;
  mods[n - 8][8] = true; // dark module

  if (ver >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      reserved[i][n - 11 + j] = reserved[n - 11 + j][i] = true;
    }
  }

  // Encode data
  const totalCodewords = getCodewordsCount(ver);
  const ecCodewords = getEcCount(ver);
  const dataCodewords = totalCodewords - ecCodewords;

  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // byte mode
  push(len, ver <= 9 ? 8 : 16);
  for (const b of data) push(b, 8);
  push(0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  while (bits.length < dataCodewords * 8) { push(0xEC, 8); if (bits.length < dataCodewords * 8) push(0x11, 8); }

  const codewords = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i * 8 + j] || 0);
    codewords[i] = v;
  }

  const ec = rsEncode(codewords, ecCodewords);
  const allBits: number[] = [];
  for (const b of codewords) push.call(null, b, 8), allBits.push(...bits.slice(bits.length - 8));
  // re-collect
  const finalBits: number[] = [];
  for (const b of codewords) for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
  for (const b of ec) for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);

  // Place data
  let idx = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (const j of [0, 1]) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!reserved[y][x] && idx < finalBits.length) {
          mods[y][x] = finalBits[idx++] === 1;
        }
      }
    }
  }

  // Apply mask 0 (checkerboard) and write format info
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!reserved[y][x] && (y + x) % 2 === 0) mods[y][x] = !mods[y][x];
  }

  // Format info for mask 0, EC level L
  const fmtBits = 0b111011111000100;
  for (let i = 0; i < 15; i++) {
    const bit = ((fmtBits >> (14 - i)) & 1) === 1;
    if (i < 6) mods[8][i] = bit;
    else if (i === 6) mods[8][7] = bit;
    else if (i === 7) mods[8][8] = bit;
    else mods[14 - i][8] = bit;

    if (i < 8) mods[n - 1 - i][8] = bit;
    else mods[8][n - 15 + i] = bit;
  }

  if (ver >= 7) {
    const vBits = versionInfo(ver);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >> i) & 1) === 1;
      mods[Math.floor(i / 3)][n - 11 + (i % 3)] = bit;
      mods[n - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }

  return mods;
}

function alignPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = 17 + ver * 4;
  const count = Math.floor(ver / 7) + 2;
  const step = Math.ceil((n - 13) / (count - 1) / 2) * 2;
  const pos = [6];
  for (let i = 1; i < count; i++) pos.push(n - 7 - (count - 1 - i) * step);
  return pos;
}

function getCodewordsCount(ver: number): number {
  const n = 17 + ver * 4;
  let total = n * n;
  total -= 3 * 64; // finders
  total -= 2 * (n - 16) + 1; // timing
  total -= 31; // format
  if (ver >= 7) total -= 36;
  const aligns = alignPositions(ver);
  let ac = 0;
  for (const ay of aligns) for (const ax of aligns) {
    if ((ay < 9 && ax < 9) || (ay < 9 && ax > n - 9) || (ay > n - 9 && ax < 9)) continue;
    ac++;
  }
  total -= ac * 25;
  return Math.floor(total / 8);
}

function getEcCount(ver: number): number {
  // EC codewords for level L (simplified table for versions 1-20)
  const ec = [0,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28];
  return ec[ver] || 28;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gf256 = new Uint8Array(256);
  const gfLog = new Uint8Array(256);
  let v = 1;
  for (let i = 0; i < 255; i++) { gf256[i] = v; gfLog[v] = i; v = (v << 1) ^ (v >= 128 ? 0x11d : 0); }
  const mul = (a: number, b: number) => a === 0 || b === 0 ? 0 : gf256[(gfLog[a] + gfLog[b]) % 255];

  const gen = new Uint8Array(ecLen + 1);
  gen[0] = 1;
  for (let i = 0; i < ecLen; i++) {
    for (let j = i + 1; j >= 1; j--) gen[j] = gen[j - 1] ^ mul(gen[j], gf256[i]);
    gen[0] = mul(gen[0], gf256[i]);
  }

  const msg = new Uint8Array(data.length + ecLen);
  msg.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 0; j <= ecLen; j++) msg[i + j] ^= mul(gen[j], coef);
  }
  return msg.slice(data.length);
}

function versionInfo(ver: number): number {
  let d = ver << 12;
  for (let i = 5; i >= 0; i--) if (d & (1 << (i + 12))) d ^= 0x1F25 << i;
  return (ver << 12) | d;
}
