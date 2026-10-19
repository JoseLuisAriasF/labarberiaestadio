import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import { Bounds, ContactShadows, OrbitControls, OrthographicCamera, RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Barbero, Silla } from '@/lib/tipos';
import { ESTADOS } from '@/lib/tipos';
import type { DefTema } from '@/lib/festivo';

// Rejilla compartida con el editor de pisos del admin: (x, z) en celdas.
export const COLS = 10;
export const FILAS = 6;
const CELDA = 1.7;

const PIEL = '#d9a07a';
const CUERO = '#7f1d1d';
const CROMO = '#cbd5e1';

/** Reloj de pared para timers: re-render cada segundo sólo donde se usa. */
function useAhora(ms = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function texturaAjedrez(oscuro: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const [a, b] = oscuro ? ['#2a303c', '#1f242e'] : ['#e9ecf1', '#cfd5df'];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 64, j * 64, 64, 64); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(COLS, FILAS);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Suelo({ oscuro }: { oscuro: boolean }) {
  const tex = useMemo(() => texturaAjedrez(oscuro), [oscuro]);
  const W = COLS * CELDA, D = FILAS * CELDA;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      {/* Paredes del diorama: fondo y lateral, a lo Habbo. */}
      <mesh position={[0, 1.6, -D / 2 - 0.1]} receiveShadow>
        <boxGeometry args={[W, 3.2, 0.2]} />
        <meshStandardMaterial color={oscuro ? '#343b48' : '#f7f8fa'} />
      </mesh>
      <mesh position={[-W / 2 - 0.1, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.2, 3.2, D + 0.4]} />
        <meshStandardMaterial color={oscuro ? '#2b313d' : '#e2e5ec'} />
      </mesh>
      {/* Zócalo índigo, el acento del sitio */}
      <mesh position={[0, 0.15, -D / 2 + 0.01]}><boxGeometry args={[W, 0.3, 0.02]} /><meshStandardMaterial color="#5563d8" /></mesh>
      <Poste position={[-W / 2 + 0.35, 0, -D / 2 + 0.35]} />
    </group>
  );
}

/** El poste de barbero: franjas que suben sin fin (textura desplazada). */
function Poste(props: ThreeElements['group']) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    ['#dc2626', '#2563eb'].forEach((col, i) => {
      g.fillStyle = col; g.beginPath();
      const o = i * 32;
      g.moveTo(o, 0); g.lineTo(o + 16, 0); g.lineTo(o + 16 - 64, 64); g.lineTo(o - 64, 64); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(o + 64, 0); g.lineTo(o + 80, 0); g.lineTo(o + 16, 64); g.lineTo(o, 64); g.closePath(); g.fill();
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame((_, dt) => { tex.offset.y -= dt * 0.4; });
  return (
    <group {...props}>
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.12, 0.12, 1.2, 24]} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveIntensity={0.15} /></mesh>
      <mesh position={[0, 2.05, 0]}><sphereGeometry args={[0.15, 16, 16]} /><meshStandardMaterial color={CROMO} metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0.75, 0]}><sphereGeometry args={[0.15, 16, 16]} /><meshStandardMaterial color={CROMO} metalness={0.8} roughness={0.2} /></mesh>
    </group>
  );
}

function Sillon() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} castShadow><cylinderGeometry args={[0.38, 0.42, 0.1, 32]} /><meshStandardMaterial color={CROMO} metalness={0.9} roughness={0.25} /></mesh>
      <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.08, 0.08, 0.45, 16]} /><meshStandardMaterial color={CROMO} metalness={0.9} roughness={0.2} /></mesh>
      <RoundedBox args={[0.75, 0.16, 0.7]} radius={0.06} position={[0, 0.58, 0]} castShadow><meshStandardMaterial color={CUERO} roughness={0.5} /></RoundedBox>
      <RoundedBox args={[0.75, 0.85, 0.14]} radius={0.06} position={[0, 1.05, -0.33]} rotation-x={-0.12} castShadow><meshStandardMaterial color={CUERO} roughness={0.5} /></RoundedBox>
      <RoundedBox args={[0.4, 0.18, 0.1]} radius={0.05} position={[0, 1.58, -0.4]} castShadow><meshStandardMaterial color={CUERO} roughness={0.5} /></RoundedBox>
      {[-0.42, 0.42].map((x) => (
        <RoundedBox key={x} args={[0.1, 0.08, 0.6]} radius={0.03} position={[x, 0.82, 0]} castShadow><meshStandardMaterial color="#1f2937" /></RoundedBox>
      ))}
      <mesh position={[0, 0.2, 0.48]} castShadow><boxGeometry args={[0.5, 0.04, 0.22]} /><meshStandardMaterial color={CROMO} metalness={0.9} roughness={0.3} /></mesh>
    </group>
  );
}

/** Barbero low-poly. `modo` decide la animación: idle, cortando o descanso con café. */
function Persona({ modo, color }: { modo: 'idle' | 'corta' | 'cafe'; color: string }) {
  const cuerpo = useRef<THREE.Group>(null!);
  const brazo = useRef<THREE.Group>(null!);
  const hojaA = useRef<THREE.Mesh>(null!);
  const hojaB = useRef<THREE.Mesh>(null!);
  const fase = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + fase;
    cuerpo.current.scale.y = 1 + Math.sin(t * 2) * 0.015; // respira
    if (modo === 'corta') {
      brazo.current.rotation.x = -1.3 + Math.sin(t * 3) * 0.25;
      brazo.current.rotation.z = Math.sin(t * 1.5) * 0.35;
      cuerpo.current.rotation.y = Math.sin(t * 0.8) * 0.25;
      const tij = Math.abs(Math.sin(t * 14)) * 0.5;
      hojaA.current.rotation.y = tij; hojaB.current.rotation.y = -tij;
    } else if (modo === 'cafe') {
      brazo.current.rotation.x = -1.1 + Math.max(0, Math.sin(t * 0.7)) * -0.5; // sorbo
      brazo.current.rotation.z = 0;
    } else {
      brazo.current.rotation.x = Math.sin(t * 1.2) * 0.08;
      brazo.current.rotation.z = 0.08;
      cuerpo.current.rotation.y = Math.sin(t * 0.5) * 0.15;
    }
  });
  return (
    <group ref={cuerpo}>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} castShadow><boxGeometry args={[0.14, 0.8, 0.16]} /><meshStandardMaterial color="#1e293b" /></mesh>
      ))}
      <RoundedBox args={[0.46, 0.62, 0.28]} radius={0.08} position={[0, 1.1, 0]} castShadow><meshStandardMaterial color={color} /></RoundedBox>
      {/* Mandil */}
      <mesh position={[0, 0.95, 0.145]}><boxGeometry args={[0.36, 0.55, 0.01]} /><meshStandardMaterial color="#111827" /></mesh>
      <mesh position={[0, 1.62, 0]} castShadow><sphereGeometry args={[0.19, 24, 24]} /><meshStandardMaterial color={PIEL} /></mesh>
      <mesh position={[0, 1.7, -0.02]} castShadow><sphereGeometry args={[0.2, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2.2]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.3, 1.1, 0]} rotation-z={0.1} castShadow><boxGeometry args={[0.11, 0.55, 0.12]} /><meshStandardMaterial color={color} /></mesh>
      <group ref={brazo} position={[0.3, 1.35, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow><boxGeometry args={[0.11, 0.55, 0.12]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, -0.56, 0]}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color={PIEL} /></mesh>
        {modo === 'corta' && (
          <group position={[0, -0.66, 0]}>
            <mesh ref={hojaA} position={[0, -0.08, 0]}><boxGeometry args={[0.02, 0.2, 0.03]} /><meshStandardMaterial color={CROMO} metalness={1} roughness={0.1} /></mesh>
            <mesh ref={hojaB} position={[0, -0.08, 0]}><boxGeometry args={[0.02, 0.2, 0.03]} /><meshStandardMaterial color={CROMO} metalness={1} roughness={0.1} /></mesh>
          </group>
        )}
        {modo === 'cafe' && (
          <mesh position={[0, -0.68, 0.05]}><cylinderGeometry args={[0.06, 0.05, 0.12, 16]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        )}
      </group>
    </group>
  );
}

/** Cliente sentado con capa. El pelo se encoge según avanza el corte (por frame, sin re-render). */
function ClienteSentado({ desde, hasta }: { desde: number; hasta: number }) {
  const cabeza = useRef<THREE.Group>(null!);
  const pelo = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    cabeza.current.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.15;
    const p = Math.min(Math.max((Date.now() - desde) / (hasta - desde || 1), 0), 1);
    pelo.current.scale.y = 1 - p * 0.55;
  });
  return (
    <group position={[0, 0.62, 0.02]}>
      <mesh position={[0, 0.35, 0]} castShadow><coneGeometry args={[0.42, 0.75, 24]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
      <mesh position={[0, 0.35, 0.0]}><torusGeometry args={[0.36, 0.015, 8, 32]} /><meshStandardMaterial color="#5563d8" /></mesh>
      <group ref={cabeza} position={[0, 0.88, 0]}>
        <mesh castShadow><sphereGeometry args={[0.18, 24, 24]} /><meshStandardMaterial color="#c68a62" /></mesh>
        <mesh ref={pelo} position={[0, 0.08, -0.01]}>
          <sphereGeometry args={[0.195, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#3f2a1d" />
        </mesh>
      </group>
    </group>
  );
}

/** Pelitos cayendo mientras corta. */
function Pelos() {
  const N = 40;
  const ref = useRef<THREE.Points>(null!);
  const pos = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { a[i * 3] = (Math.random() - 0.5) * 0.5; a[i * 3 + 1] = 0.6 + Math.random() * 1; a[i * 3 + 2] = (Math.random() - 0.5) * 0.5; }
    return a;
  }, []);
  useFrame((_, dt) => {
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = p.getY(i) - dt * (0.3 + (i % 5) * 0.08);
      if (y < 0.02) y = 1.55;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.035} color="#3f2a1d" />
    </points>
  );
}

/** Partículas festivas cayendo por todo el local (nieve, brasas, pétalos…). */
function Festivo3D({ color }: { color: string }) {
  const N = 90;
  const W = COLS * CELDA, D = FILAS * CELDA;
  const ref = useRef<THREE.Points>(null!);
  const pos = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { a[i * 3] = (Math.random() - 0.5) * W; a[i * 3 + 1] = Math.random() * 5.5; a[i * 3 + 2] = (Math.random() - 0.5) * D; }
    return a;
  }, []);
  useFrame((_, dt) => {
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) { let y = p.getY(i) - dt * (0.35 + (i % 5) * 0.12); if (y < 0.05) y = 5.5; p.setY(i, y); }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.13} color={color} transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

/** Anillo de estado en el suelo: verde respirando, rojo/ámbar cortando, azul en descanso. */
function Anillo({ color, pulso }: { color: string; pulso: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const luz = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    const k = pulso ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.2) : 0.6;
    mat.current.emissiveIntensity = 0.6 + k * 1.6;
    luz.current.intensity = 1.5 + k * 3;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.62, 0.74, 48]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} transparent opacity={0.9} />
      </mesh>
      <pointLight ref={luz} color={color} position={[0, 0.6, 0.5]} distance={2.6} decay={2} />
    </group>
  );
}

function Etiqueta({ barbero, onSelect }: { barbero: Barbero | null; onSelect?: () => void }) {
  const ahora = useAhora();
  if (!barbero) return <div className="chip text-base-400 whitespace-nowrap">Silla libre</div>;
  const e = ESTADOS[barbero.estado];
  const cortando = barbero.estado.startsWith('CORTANDO') && barbero.estado_hasta;
  const resta = cortando ? Math.max(0, (Date.parse(barbero.estado_hasta!) - ahora) / 1000) : 0;
  return (
    <button onClick={onSelect} className="neu-sm rounded-2xl pl-1 pr-2.5 py-1 flex items-center gap-2 whitespace-nowrap text-left cursor-pointer select-none hover:scale-105 transition-transform">
      {barbero.avatar_url
        ? <img src={barbero.avatar_url} alt="" className="size-8 rounded-full object-cover" loading="lazy" />
        : <span className="size-8 rounded-full grid place-items-center bg-acento-500 text-white text-xs font-bold">{barbero.nombre.slice(0, 2).toUpperCase()}</span>}
      <span className="leading-tight">
        <span className="block text-[12px] font-semibold text-base-800 dark:text-base-100">{barbero.nombre}</span>
        <span className="block text-[10px] text-base-500">
          {e.emoji} {e.texto}{cortando && <b className="ml-1 tabular-nums" style={{ color: e.color }}>{resta > 0 ? mmss(resta) : 'terminando…'}</b>}
        </span>
      </span>
      {barbero.cola > 0 && (
        <span className="ml-1 rounded-full bg-acento-500 text-white text-[10px] font-bold px-1.5 py-0.5" title="Personas en cola">👥 {barbero.cola}</span>
      )}
    </button>
  );
}

const posicion = (s: Silla) => [
  (Number(s.posicion_x) + 0.5 - COLS / 2) * CELDA,
  (Number(s.posicion_z) + 0.5 - FILAS / 2) * CELDA,
] as const;

/** Etiquetas DOM sobre el canvas: cada frame se proyecta el punto 3D a píxeles.
    (drei <Html> crea una raíz React por etiqueta y choca con React 19.) */
function Proyector({ sillas, etiquetas }: { sillas: Silla[]; etiquetas: React.RefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const s of sillas) {
      const el = etiquetas.current.get(s.id);
      if (!el) continue;
      const [x, z] = posicion(s);
      v.set(x, 2.35, z).project(camera);
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

function Puesto({ silla, barbero, seleccionado, onSelect }: {
  silla: Silla; barbero: Barbero | null; seleccionado: boolean; onSelect?: (b: Barbero) => void;
}) {
  const [hover, setHover] = useState(false);
  const [x, z] = posicion(silla);
  const estado = barbero?.estado ?? 'LIBRE';
  const color = barbero ? ESTADOS[estado].color : '#64748b';
  const cortando = estado === 'CORTANDO_CITA' || estado === 'CORTANDO_WALKIN';
  const elegir = () => barbero && onSelect?.(barbero);

  useEffect(() => { document.body.style.cursor = hover && barbero ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover, barbero]);

  return (
    <group position={[x, 0, z]} rotation-y={(Number(silla.rotacion) * Math.PI) / 180}
      onClick={(e) => { e.stopPropagation(); elegir(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
      scale={hover || seleccionado ? 1.06 : 1}>
      <Anillo color={color} pulso={estado === 'LIBRE'} />
      <Sillon />
      {/* Espejo en la "pared" detrás del sillón */}
      <mesh position={[0, 1.5, -0.75]}><boxGeometry args={[0.9, 1.1, 0.04]} /><meshStandardMaterial color="#94a3b8" metalness={1} roughness={0.08} /></mesh>
      {barbero && cortando && (
        <>
          <ClienteSentado desde={Date.parse(barbero.estado_desde)} hasta={barbero.estado_hasta ? Date.parse(barbero.estado_hasta) : Date.now() + 30 * 60e3} />
          <group position={[0.15, 0, -0.55]} rotation-y={0.2}><Persona modo="corta" color={estado === 'CORTANDO_CITA' ? '#5563d8' : '#b45309'} /></group>
          <Pelos />
        </>
      )}
      {barbero && estado === 'LIBRE' && <group position={[0.7, 0, 0.1]} rotation-y={-0.5}><Persona modo="idle" color="#5563d8" /></group>}
      {barbero && estado === 'DESCANSO' && <group position={[0.75, 0, 0.35]} rotation-y={-0.9}><Persona modo="cafe" color="#475569" /></group>}
    </group>
  );
}

export default function Barberia3D({ sillas, barberos, seleccionId, onSelect, tema = null, alto = 'h-[58vh] min-h-[360px]' }: {
  sillas: Silla[]; barberos: Barbero[]; seleccionId?: string | null; onSelect?: (b: Barbero) => void; tema?: DefTema | null; alto?: string;
}) {
  const [oscuro, setOscuro] = useState(true);
  useEffect(() => {
    const leer = () => setOscuro(document.documentElement.classList.contains('dark'));
    leer();
    const mo = new MutationObserver(leer);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  const porId = useMemo(() => new Map(barberos.filter((b) => b.presente).map((b) => [b.id, b])), [barberos]);
  const etiquetas = useRef(new Map<string, HTMLElement>());

  return (
    <div className={`${alto} w-full rounded-2xl neu-inset overflow-hidden relative`}>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <OrthographicCamera makeDefault position={[14, 14, 14]} zoom={40} near={0.1} far={200} />
        <ambientLight intensity={oscuro ? 0.55 : 0.9} />
        <hemisphereLight args={['#c7d2fe', '#1e293b', oscuro ? 0.5 : 0.7]} />
        <directionalLight position={[8, 14, 6]} intensity={oscuro ? 1.1 : 1.6} castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
        <Bounds fit clip observe margin={1.05}>
          <Suelo oscuro={oscuro} />
        </Bounds>
        {sillas.map((s) => (
          <Puesto key={s.id} silla={s} barbero={s.barbero_id ? porId.get(s.barbero_id) ?? null : null}
            seleccionado={!!s.barbero_id && s.barbero_id === seleccionId} onSelect={onSelect} />
        ))}
        {tema && <Festivo3D color={tema.color} />}
        <Proyector sillas={sillas} etiquetas={etiquetas} />
        <ContactShadows position={[0, 0.01, 0]} opacity={0.35} scale={30} blur={2.5} far={4} />
        <OrbitControls makeDefault enablePan={false} minZoom={20} maxZoom={120}
          minPolarAngle={0.5} maxPolarAngle={1.15} minAzimuthAngle={0} maxAzimuthAngle={Math.PI / 2} />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {sillas.map((s) => {
          const b = s.barbero_id ? porId.get(s.barbero_id) ?? null : null;
          return (
            <div key={s.id} ref={(el) => { if (el) etiquetas.current.set(s.id, el); else etiquetas.current.delete(s.id); }}
              className="absolute left-0 top-0 pointer-events-auto will-change-transform">
              <Etiqueta barbero={b} onSelect={b ? () => onSelect?.(b) : undefined} />
            </div>
          );
        })}
      </div>
      {sillas.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-base-400 pointer-events-none">Este piso aún no tiene sillas.</p>
      )}
    </div>
  );
}
