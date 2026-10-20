// Ayuda detallada de cada vista del panel. Se abre con el botón ? según la sección que estás viendo.
export type SeccionAyuda = { titulo: string; items: string[] };
export type AyudaVista = { titulo: string; resumen: string; secciones: SeccionAyuda[] };

export const AYUDA: Record<string, AyudaVista> = {
  agenda: {
    titulo: 'Citas',
    resumen: 'Aquí ves las citas del día, los pagos por validar y la cola. Todo se actualiza solo cuando alguien reserva o cambia algo.',
    secciones: [
      { titulo: 'Arriba', items: [
        'Flechas ‹ › cambian de día. El selector de fecha abre el calendario. "Hoy" vuelve al día actual.',
        'Filtro "Todos los barberos" (solo el dueño): muestra las citas de un barbero.',
        '"Ver todas" muestra también las citas terminadas o canceladas. "Ver solo activas" vuelve a la vista normal.',
        '"Walk-in" agrega a alguien que llegó sin cita (ver abajo).',
      ] },
      { titulo: 'Resumen', items: [
        'Primer cuadro: citas por validar (si hay, se resaltan en ámbar) o citas activas.',
        'Atendidos: cortes completados en el día.',
        'Cobrado: suma de lo cobrado en el día.',
      ] },
      { titulo: 'Citas por validar (arriba, en ámbar)', items: [
        'Son reservas con adelanto pendiente. Con captura de Yape/Plin, toca "Revisar pago": verás la captura, confirma en tu app y luego pulsa Aprobar (o Rechazar).',
        'Sin captura, "Lo conozco · confirmar" confirma la cita sin pago. Úsalo solo si conoces a la persona.',
      ] },
      { titulo: 'Cada fila de cita', items: [
        'La barra de color a la izquierda indica el estado: ámbar = pago por validar, dorado = confirmada, azul = en cola, verde = en curso.',
        '"Iniciar": el barbero empieza el corte. "No vino": marca la cita como no asistida.',
        '"Completar" (cuando está en curso): pide método de pago (efectivo, Yape, Plin o transferencia), monto cobrado y una foto del corte opcional. Al terminar muestra la cartilla del cliente.',
        '"✏️ Nombre" aparece en citas sin cuenta (walk-in o reserva anónima): corrige el nombre. Un cliente con cuenta cambia su nombre desde su perfil.',
        'La X cancela la cita (pide confirmación).',
        'Un cliente con DNI muestra su nombre, DNI y WhatsApp. Un anónimo aparece como "Anónimo · sin DNI".',
      ] },
      { titulo: 'Walk-in (cliente sin cita)', items: [
        'Elige "Con documento" para sumar cortes a su cartilla, o "Anónimo" si no quiere dar DNI.',
        'Con documento: "Buscar" consulta nombre y apellidos desde el DNI. Si ya es cliente, aparece "Lo de siempre".',
        '"Registrar cliente sin cita" guarda su ficha sin crear cita. Solo se registra al pulsarlo.',
        'Barbero y servicio: elige quién lo atiende y qué corte. "Agregar a la cola" lo pone en la cola de ese barbero.',
      ] },
    ],
  },
  equipo: {
    titulo: 'Barberos',
    resumen: 'Administra a tu equipo: cuentas, comisiones y, si eres el dueño, permisos.',
    secciones: [
      { titulo: 'Nuevo barbero (solo el dueño)', items: [
        'Nombre visible, usuario para el login (solo minúsculas, números o _) y clave temporal.',
        'Correo, teléfono y WhatsApp son opcionales. Si pones correo, se le envían sus accesos.',
        'El barbero entra con el código de la barbería + su usuario + la clave temporal, y debe cambiarla al entrar.',
      ] },
      { titulo: 'Cada barbero', items: [
        'Toca la foto para cambiarla.',
        'Comisión (solo en modo centralizado): porcentaje que se queda el barbero. Si lo dejas vacío, usa el general.',
        '"🔑 Permisos" (solo el dueño): marca un "Administrador de confianza" (acceso a todo el panel) o solo algunos módulos.',
        '"Clave": genera una clave temporal nueva para el barbero (pide confirmación).',
        '"Dar de baja" bloquea su acceso. "Reactivar" lo vuelve a habilitar.',
      ] },
      { titulo: 'Importante', items: [
        'Crear cuentas, dar de baja y asignar permisos son solo del dueño.',
        'Un barbero con permiso de "Barberos" puede editar datos de otros barberos, pero no crear cuentas.',
      ] },
    ],
  },
  servicios: {
    titulo: 'Servicios',
    resumen: 'El catálogo de cortes que ven tus clientes al reservar.',
    secciones: [
      { titulo: 'Botones', items: [
        '"Nuevo": agrega un servicio.',
        'Toca una fila para editarla. El icono de papelera la elimina (pide confirmación).',
      ] },
      { titulo: 'Campos', items: [
        'Nombre: como lo verá el cliente (2 a 60 letras).',
        'Descripción: opcional, sale en la ficha del corte.',
        'Precio base (S/): lo que paga el cliente. Con cupón de lealtad se descuenta de aquí.',
        'Duración (minutos): define cuánto tiempo bloquea la agenda del barbero.',
        'Foto referencial: opcional.',
        '"Visible para clientes": si lo apagas, sigue en tu catálogo pero no se puede reservar.',
      ] },
      { titulo: 'Después', items: [
        'Cada barbero elige qué cortes hace y cuáles son sus ⭐ best sellers desde "Mi jornada".',
      ] },
    ],
  },
  pisos: {
    titulo: 'Pisos 3D',
    resumen: 'El plano del local. Los clientes lo ven en 3D al elegir barbero.',
    secciones: [
      { titulo: 'Botones', items: [
        '"Crear piso": agrega un piso. "Girar": rota el plano para acomodarlo.',
        '"Guardar plano": guarda posiciones y sillas. Hazlo siempre antes de salir.',
        '"Quitar" en un piso: elimina el piso y sus sillas (pide confirmación).',
      ] },
      { titulo: 'Sillas', items: [
        'Toca una silla para seleccionarla y asignarle un barbero en "Barbero asignado".',
        'Para agregar una silla nueva, usa el botón de silla. Arrastra una silla para moverla.',
        '"Quitar" en una silla la elimina del plano.',
        'Una silla sin barbero aparece vacía para los clientes.',
      ] },
    ],
  },
  clientes: {
    titulo: 'Clientes',
    resumen: 'Tus clientes, su cartilla de premios y su historial. Puedes verificar, registrar y corregir datos.',
    secciones: [
      { titulo: 'Verificar por DNI (arriba)', items: [
        'Escribe 8 dígitos y pulsa Buscar.',
        'Si existe: "Verificar 100% por DNI" le da confianza para reservar sin adelanto.',
        'Si no existe: aparece "Registrar cliente". El nombre se llena desde el DNI. Pon su celular si lo tienes.',
        'Después, el cliente entra a la web con Google y confirma su DNI y celular para vincular su cuenta.',
      ] },
      { titulo: 'Lista', items: [
        'El buscador filtra por nombre o documento.',
        'Cada fila muestra cuántos cortes lleva. Toca una para abrir su ficha.',
      ] },
      { titulo: 'Ficha del cliente', items: [
        'Datos del cliente: nombre, celular y correo. Cambia lo que haga falta y pulsa "Guardar cambios".',
        'Cartillas y premios: cuánto le falta para su próximo premio, por barbero o general.',
        'Últimas citas: su historial en el local.',
        '"Eliminar cliente…" (zona de peligro): primero confirmas, luego escribes ELIMINAR. Solo se eliminan clientes sin cuenta propia. Su historial de citas se conserva con su nombre, pero se pierde su cartilla.',
      ] },
    ],
  },
  lealtad: {
    titulo: 'Lealtad',
    resumen: 'Premios por fidelidad: cada cierto número de cortes, el cliente gana algo.',
    secciones: [
      { titulo: 'Ámbito del conteo', items: [
        'Global: los cortes suman con cualquier barbero del local.',
        'Por barbero: cada barbero lleva su propia cartilla con el cliente.',
      ] },
      { titulo: 'Metas y premios', items: [
        '"Cada N cortes": cuántos cortes hacen falta.',
        '"Gana": un corte gratis o un descuento en %.',
        '"Aplica a": toda la barbería o solo un barbero.',
        'Texto para el cliente: opcional, se muestra en su cartilla.',
        'Activo: si lo apagas, deja de contar para nuevos premios.',
      ] },
    ],
  },
  productos: {
    titulo: 'Productos',
    resumen: 'Productos que vendes en el local (ceras, aceites, champús…).',
    secciones: [
      { titulo: 'Botones', items: [
        '"Nuevo": agrega un producto. Toca una fila para editarlo. La papelera lo elimina (pide confirmación).',
      ] },
      { titulo: 'Campos', items: [
        'Nombre, categoría y descripción: lo que ve el cliente.',
        'Precio (S/) y stock: cuántas unidades tienes.',
        'Imagen: opcional.',
        '"Publicado": si lo apagas, no aparece en la web.',
      ] },
    ],
  },
  finanzas: {
    titulo: 'Finanzas',
    resumen: 'Cuánto entró, cuánto se paga a barberos y cuánto queda después de gastos.',
    secciones: [
      { titulo: 'Reporte del mes', items: [
        'Facturado: todo lo cobrado en el mes.',
        'Atenciones: cortes completados.',
        'Comisiones a pagar: lo que corresponde a los barberos según su comisión.',
        'Ganancia neta: facturado menos comisiones y gastos.',
      ] },
      { titulo: 'Modelo financiero', items: [
        'Alquiler mensual por silla y comisión por defecto para barberos.',
        'Guárdalos con el botón "Guardar" de esa sección.',
      ] },
      { titulo: 'Gastos del mes', items: [
        '"Agregar gasto": concepto (ej. luz, alquiler), categoría, monto en S/ y, si aplica, el barbero.',
        '"Quitar" elimina un gasto registrado.',
      ] },
    ],
  },
  estadisticas: {
    titulo: 'Estadísticas',
    resumen: 'Cómo va el negocio en el mes que elijas.',
    secciones: [
      { titulo: 'Arriba', items: [
        'Selector de mes: cambia el periodo que ves.',
        'Facturado, cortes y ticket promedio (lo que en promedio paga cada cliente).',
      ] },
      { titulo: 'Gráficos', items: [
        'Ingresos por día: en qué días entró más dinero.',
        'Servicios más pedidos: qué cortes son los favoritos.',
        'Horas pico: a qué horas llegan más clientes.',
        'Cortes por barbero: quién atendió más.',
        'Clientes frecuentes: quiénes vienen más (solo clientes con documento).',
      ] },
    ],
  },
  mijornada: {
    titulo: 'Mi jornada',
    resumen: 'Tu propia jornada de barbero, desde el mismo panel.',
    secciones: [
      { titulo: 'Estado', items: [
        '"Llegué al local" / "Me retiro": aparece o no en tu silla para los clientes.',
        'Botones de estado (libre, atendiendo, descanso): se ven en el mapa 3D y en la lista de barberos.',
        'Tiempo estimado: minutos que durará tu corte actual.',
      ] },
      { titulo: 'Cola', items: [
        'Muestra el siguiente cliente de tu cola. "Empezar" lo marca como atendido y el timer se ajusta solo.',
      ] },
      { titulo: 'Perfil del barbero (pestaña "Mi perfil")', items: [
        'Foto, sobre mí, especialidades y contacto (email, teléfono, WhatsApp).',
        'Tu Yape y Plin, si el cobro es individual.',
        'Tu horario de atención.',
        'Servicios: importa los cortes del catálogo y marca tus ⭐ best sellers.',
      ] },
    ],
  },
  local: {
    titulo: 'Local',
    resumen: 'Todo lo que ven los clientes de tu barbería en la web y en Google.',
    secciones: [
      { titulo: 'Datos del negocio', items: [
        'Nombre, descripción (sale en Google), teléfono, WhatsApp (con 51) y correo de contacto.',
        'Logo: pega un enlace https o sube una imagen. Se ve en la web y en el icono de la app.',
      ] },
      { titulo: 'Ubicación', items: [
        'Dirección exacta, distrito, ciudad y referencia.',
        '"Buscar dirección en el mapa": marca el punto exacto del local.',
        'Fotos del local: hasta 8. La papelera de cada una la quita.',
      ] },
      { titulo: 'Horario y cobros', items: [
        'Horario general de atención. Cada barbero puede tener su propio horario en "Mi jornada".',
        'Cobros por Yape/Plin (modo centralizado): número, titular y QR de pago que ven los clientes al reservar.',
      ] },
      { titulo: 'QR para reservas', items: [
        'Imprime el QR y ponlo en el local: el cliente lo escanea y va directo a reservar.',
        '"Descargar PNG" para imprimirlo. "Copiar enlace" para compartirlo por WhatsApp.',
      ] },
      { titulo: 'Botones', items: [
        '"Guardar cambios": guarda todo lo de esta sección.',
        '"Publicar en Google": regenera la web para Google con estos datos. Tarda 1 a 2 minutos.',
        '"Estoy en el local": marca tu presencia (si eres barbero que también atiende).',
      ] },
    ],
  },
  festivos: {
    titulo: 'Festivos',
    resumen: 'Decoración de temporada para la web pública y el local 3D (Fiestas Patrias, Navidad, Halloween…).',
    secciones: [
      { titulo: 'Qué hacer', items: [
        'Elige cómo se decora la web y el local en 3D. Se guarda al instante, no hace falta "Guardar".',
      ] },
      { titulo: 'Opciones', items: [
        '✨ Automático por fecha (recomendado): se decora solo en cada temporada.',
        '⚪ Sin decoración: apaga todos los efectos festivos.',
        'Cada tema (Navidad, Fiestas Patrias…): lo fuerza todo el año, útil para probarlo antes de la fecha.',
      ] },
      { titulo: 'Vista previa', items: [
        'Muestra lo que ven los clientes ahora mismo. Si dice "Sin decoración en este momento", no hay temporada activa.',
      ] },
    ],
  },
  jornada: {
    titulo: 'Mi jornada',
    resumen: 'Tu día en el local: llegada, cola y estado. Lo que cambias aquí lo ven los clientes en vivo.',
    secciones: [
      { titulo: 'Llegada', items: [
        '"Llegué al local": apareces en tu silla para los clientes. Al irte, pulsa "Me retiro".',
        'Si no has llegado, tu silla aparece vacía.',
      ] },
      { titulo: 'Cola', items: [
        'Muestra cuántas personas esperan y quién sigue (clientes sin cita).',
        '"Empezar" atiende al primero: te marca ocupado y el tiempo estimado se ajusta solo.',
      ] },
      { titulo: 'Estado', items: [
        'Libre, atendiendo cita, atendiendo sin cita o descanso: un toque para cambiar.',
        'Tiempo estimado: minutos del corte actual. Los clientes ven cuándo quedas libre.',
      ] },
      { titulo: 'Hoy y mañana', items: [
        'Tus citas de hoy y de mañana, con hora, cliente, corte y estado.',
        'Toca una cita para ver su detalle, escribirle por WhatsApp o gestionarla en Citas.',
      ] },
      { titulo: 'Nuevo corte', items: [
        'El botón central Corte sirve para un cliente que llega sin cita.',
        'Elige si da su DNI o es anónimo, escribe su nombre, y elige el corte: arriba salen los que más haces.',
      ] },
    ],
  },
  perfil: {
    titulo: 'Mi perfil',
    resumen: 'Tus datos, tu horario y tus cortes. Lo que pongas aquí se ve en tu ficha de la web.',
    secciones: [
      { titulo: 'Foto y datos', items: [
        'Toca tu foto (o tus iniciales) para cambiarla.',
        'Sobre mí (hasta 300 caracteres) y especialidades separadas por coma.',
        'Email, teléfono y WhatsApp con 51 para avisos y para que te escriban los clientes.',
        'Yape y Plin: solo si el cobro es individual.',
        'Pulsa "Guardar perfil" para aplicar los cambios.',
      ] },
      { titulo: 'Horario', items: [
        'Tus días y horas de atención. Los clientes solo pueden reservar dentro de este horario.',
      ] },
      { titulo: 'Servicios', items: [
        '"Importar" trae un corte del catálogo de la barbería a tu lista.',
        '"☆ Destacar" lo marca como ⭐ best seller: se resalta en tu ficha.',
        '"Quitar" lo saca de tu lista (no borra el catálogo).',
      ] },
    ],
  },
};

// Qué elemento de la vista resalta cada sección de la ayuda (sección sin ancla = se junta con la siguiente).
export const EL_AYUDA: Record<string, Record<string, string>> = {
  agenda: {
    'Arriba': '[data-ayuda="agenda-fecha"]',
    'Resumen': '[data-ayuda="agenda-resumen"]',
    'Citas por validar (arriba, en ámbar)': '[data-ayuda="agenda-pendientes"]',
    'Cada fila de cita': '[data-ayuda="agenda-lista"]',
    'Walk-in (cliente sin cita)': '[data-ayuda="agenda-walkin"]',
  },
  equipo: {
    'Nuevo barbero (solo el dueño)': '[data-ayuda="equipo-cabecera"]',
    'Cada barbero': '[data-ayuda="equipo-lista"]',
  },
  servicios: { 'Campos': '[data-crud="servicios_cortes"]' },
  pisos: { 'Sillas': '[data-ayuda="pisos-plano"]' },
  clientes: {
    'Verificar por DNI (arriba)': '[data-ayuda="clientes-verificar"]',
    'Lista': '[data-ayuda="clientes-lista"]',
    'Ficha del cliente': '[data-ayuda="clientes-datos"]',
  },
  lealtad: {
    'Ámbito del conteo': '[data-ayuda="lealtad-ambito"]',
    'Metas y premios': '[data-crud="gamificacion_premios"]',
  },
  productos: { 'Campos': '[data-crud="productos"]' },
  finanzas: {
    'Reporte del mes': '[data-ayuda="fin-reporte"]',
    'Modelo financiero': '[data-ayuda="fin-modelo"]',
    'Gastos del mes': '[data-ayuda="fin-gastos"]',
  },
  estadisticas: { 'Arriba': '[data-ayuda="est-resumen"]', 'Gráficos': '[data-ayuda="est-graficos"]' },
  mijornada: { 'Estado': '[data-guia="llegada"]', 'Cola': '[data-guia="cola"]' },
  local: {
    'Datos del negocio': '[data-ayuda="local-datos"]',
    'Ubicación': '[data-ayuda="local-ubicacion"]',
    'Horario y cobros': '[data-ayuda="local-horario"]',
    'QR para reservas': '[data-ayuda="local-qr"]',
  },
  festivos: { 'Qué hacer': '[data-ayuda="festivos"]', 'Opciones': '[data-ayuda="festivos-opciones"]', 'Vista previa': '[data-ayuda="festivos-previa"]' },
  jornada: { 'Llegada': '[data-guia="llegada"]', 'Cola': '[data-guia="cola"]', 'Estado': '[data-guia="estado"]', 'Hoy y mañana': '[data-ayuda="inicio-hoy"]', 'Nuevo corte': '[data-guia="nuevo-corte"]' },
  perfil: { 'Foto y datos': '[data-ayuda="perfil-datos"]', 'Horario': '[data-ayuda="perfil-horario"]', 'Servicios': '[data-ayuda="perfil-servicios"]' },
};
