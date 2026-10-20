// Guía interactiva (driver.js, como en Papichulo). Cada paso apunta a un elemento con data-guia.
import { AYUDA, EL_AYUDA } from './ayuda';
type Rol = 'cliente' | 'admin' | 'barbero';
type Paso = { el: string; titulo: string; texto: string };

const TOURS: Record<Rol, Paso[]> = {
  cliente: [
    { el: '[data-guia="reservar"]', titulo: 'Reserva en 3 pasos', texto: 'Elige tu corte, el día y la hora. Solo verás horas libres.' },
    { el: '[data-guia="pasos"]', titulo: 'Cómo funciona', texto: 'Primera vez: pagas por Yape o Plin y tu cita queda confirmada. Si el barbero ya te conoce, puede confirmarla sin pago.' },
    { el: '[data-guia="barberos"]', titulo: 'Tu barbero', texto: 'Mira quién está en el local, si está libre o cortando, y cuánta cola hay.' },
    { el: '[data-guia="vista"]', titulo: 'Lista o mapa 3D', texto: 'Cambia entre la lista y el mapa del local en vivo.' },
    { el: '[data-guia="perfil"]', titulo: 'Tu perfil', texto: 'Aquí ves tus citas, tu cartilla de premios y tus cortes anteriores.' },
  ],
  admin: [
    { el: '[data-guia="tab-agenda"]', titulo: 'Citas', texto: 'Aquí llegan las reservas y los pagos por validar.' },
    { el: '[data-guia="tab-equipo"]', titulo: 'Barberos', texto: 'Agrega barberos y su usuario y clave. Solo tú asignas permisos: un administrador de confianza o módulos sueltos.' },
    { el: '[data-guia="tab-local"]', titulo: 'Local', texto: 'Datos del local, horario, Yape/Plin, QR de pago y logo. Aquí también publicas la ficha en Google.' },
    { el: '[data-guia="tab-productos"]', titulo: 'Productos', texto: 'Productos a la venta: precio, stock y si están publicados.' },
    { el: '[data-guia="tab-festivos"]', titulo: 'Festivos', texto: 'Temas especiales para fechas festivas en la web pública.' },
    { el: '[data-guia="tab-servicios"]', titulo: 'Servicios', texto: 'Define cortes, precios y duración.' },
    { el: '[data-guia="tab-pisos"]', titulo: 'Pisos 3D', texto: 'Diseña el local y asigna cada barbero a su silla.' },
    { el: '[data-guia="tab-clientes"]', titulo: 'Clientes', texto: 'Lista de clientes con su cartilla de premios y su historial.' },
    { el: '[data-guia="tab-lealtad"]', titulo: 'Lealtad', texto: 'Define premios: cada N cortes, un corte gratis o un descuento.' },
    { el: '[data-guia="tab-finanzas"]', titulo: 'Finanzas', texto: 'Ingresos, comisiones, gastos y ganancia neta del mes.' },
    { el: '[data-guia="tab-estadisticas"]', titulo: 'Estadísticas', texto: 'Gráficos de cortes, horas pico y clientes frecuentes.' },
    { el: '[data-guia="tab-mijornada"]', titulo: 'Mi jornada', texto: 'Si también atiendes, activa tu perfil de barbero aquí.' },
  ],
  barbero: [
    { el: '[data-guia="llegada"]', titulo: 'Llegada', texto: 'Marca "Llegué al local" para aparecer en tu silla. Al irte, pulsa "Me retiro".' },
    { el: '[data-guia="cola"]', titulo: 'Cola', texto: 'Aquí ves al siguiente cliente. "Empezar" te marca ocupado y los clientes ven tu tiempo.' },
    { el: '[data-guia="estado"]', titulo: 'Tu estado', texto: 'Cambia entre libre, atendiendo o descanso en un toque.' },
    { el: '[data-guia="tab-agenda"]', titulo: 'Citas', texto: 'Por defecto ves pendientes y en cola. "Ver todas" muestra el resto.' },
    { el: '[data-guia="tab-clientes"]', titulo: 'Clientes', texto: 'Tus clientes, con su cartilla de premios y su historial.' },
  ],
};

type DriverGlobal = { driver?: { js?: { driver: (opts: Record<string, unknown>) => { drive: () => void } } } };

let cargando: Promise<void> | null = null;
function cargarDriver() {
  if ((window as unknown as DriverGlobal).driver?.js) return Promise.resolve();
  return (cargando ??= new Promise<void>((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js';
    js.onload = () => res();
    js.onerror = () => rej(new Error('No se pudo cargar la guía'));
    document.head.appendChild(js);
  }));
}

const EN_BARRA = ['tab-agenda', 'tab-clientes', 'tab-finanzas', 'tab-equipo'];

export async function iniciarGuia(rol: Rol) {
  await cargarDriver();
  const driver = (window as unknown as DriverGlobal).driver!.js!.driver;
  // En celular el menú de admin está cerrado: se explica con tarjetas, sin resaltar elementos ocultos.
  const movil = window.matchMedia('(max-width: 1023px)').matches && rol === 'admin';
  const steps = TOURS[rol]
    .filter((p) => movil || document.querySelector(p.el))
    .map((p) => {
      const enMas = !EN_BARRA.includes(p.el.match(/tab-[a-z]+/)?.[0] ?? '');
      return {
        element: movil ? undefined : p.el,
        popover: {
          title: p.titulo,
          description: movil && enMas ? `${p.texto} Está en el botón «Más» de abajo.` : p.texto,
        },
      };
    });
  if (steps.length === 0) return;
  driver({
    steps, showProgress: true, allowClose: true, smoothScroll: true, stagePadding: 6, stageRadius: 14,
    nextBtnText: 'Siguiente', prevBtnText: 'Atrás', doneBtnText: 'Listo', progressText: 'Paso {{current}} de {{total}}',
    popoverClass: 'guia-tour',
  }).drive();
}

/** Ayuda guiada de la vista abierta: un paso por cada punto, para que el texto quepa en el celular. */
export async function iniciarAyudaVista(vista: string) {
  const ayuda = AYUDA[vista];
  if (!ayuda) return;
  await cargarDriver();
  const driver = (window as unknown as DriverGlobal).driver!.js!.driver;
  const steps: { element?: string; popover: { title: string; description: string } }[] = [];
  let ultimo = `[data-vista="${vista}"]`;
  for (const sec of ayuda.secciones) {
    const el = EL_AYUDA[vista]?.[sec.titulo];
    const destino = el && document.querySelector(el) ? el : ultimo;
    ultimo = destino;
    sec.items.forEach((texto, n) => {
      const titulo = sec.items.length > 1 ? `${sec.titulo} (${n + 1}/${sec.items.length})` : sec.titulo;
      steps.push({ element: destino, popover: { title: titulo, description: texto } });
    });
  }
  if (steps.length === 0) return;
  driver({
    steps, showProgress: true, allowClose: true, smoothScroll: true, stagePadding: 6, stageRadius: 14,
    nextBtnText: 'Siguiente', prevBtnText: 'Atrás', doneBtnText: 'Listo', progressText: 'Paso {{current}} de {{total}}',
    popoverClass: 'guia-tour',
  }).drive();
}
