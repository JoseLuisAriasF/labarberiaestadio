import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Globe, LocateFixed, Save, Trash2, Upload } from 'lucide-react';
import { msg, subirImagen, supabase } from '@/lib/supabase';
import type { Barberia, Horario } from '@/lib/tipos';
import EditorHorario from '../Horario';
import { Aviso } from '../ui';
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

      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="flex flex-wrap gap-2 sticky bottom-3">
        <button className="btn-acento" onClick={guardar}><Save className="size-4" /> Guardar cambios</button>
        <button className="btn" onClick={publicar} title="Regenera la web para Google con estos datos"><Globe className="size-4" /> Publicar en Google</button>
      </div>
    </div>
  );
}
