export type EstadoBarbero = 'LIBRE' | 'CORTANDO_CITA' | 'CORTANDO_WALKIN' | 'DESCANSO';
export type Horario = Record<string, [string, string] | null>; // "1".."7" (ISO, 1 = lunes)

export interface Barberia {
  id: string; codigo: string; nombre: string; descripcion?: string | null;
  telefono?: string | null; whatsapp?: string | null; email_contacto?: string | null;
  direccion?: string | null; referencia?: string | null; distrito?: string | null; ciudad?: string | null;
  lat?: number | null; lng?: number | null; horario: Horario; fotos: string[];
  modo_financiero: 'CENTRALIZADO' | 'INDIVIDUAL'; modo_gamificacion: 'GLOBAL' | 'POR_BARBERO';
  comision_pct: number; alquiler_mensual: number;
  yape_numero?: string | null; plin_numero?: string | null; titular_pago?: string | null; qr_pago_url?: string | null;
  plan: 'TRIAL' | 'ACTIVO' | 'SUSPENDIDO'; trial_ends_at: string; owner_id?: string | null;
}
export interface Piso { id: string; barberia_id: string; numero_piso: number; nombre?: string | null }
export interface Silla { id: string; barberia_id: string; piso_id: string; posicion_x: number; posicion_z: number; rotacion: number; barbero_id: string | null }
export interface Barbero {
  id: string; barberia_id: string; usuario: string; nombre: string; avatar_url?: string | null; bio?: string | null;
  especialidades_bestseller: string[]; horario_atencion: Horario;
  estado: EstadoBarbero; estado_desde: string; estado_hasta: string | null; cola: number;
  comision_pct: number | null; yape_numero?: string | null; plin_numero?: string | null;
  debe_cambiar_clave: boolean; activo: boolean; usuario_id?: string | null;
}
export interface Servicio { id: string; barberia_id: string; nombre: string; descripcion?: string | null; precio_base: number; duracion_min: number; foto_url?: string | null; activo: boolean }
export interface BarberoServicio { barbero_id: string; servicio_id: string; es_bestseller: boolean }
export interface Producto { id: string; barberia_id: string; nombre: string; descripcion?: string | null; categoria?: string | null; precio: number; stock: number; imagen_url?: string | null; activo: boolean }
export interface Cliente { id: string; usuario_id: string; nombre: string | null; email: string | null; telefono: string | null; dni: string; estado_verificacion: 'UNVERIFIED' | 'VERIFIED_100' }
export type EstadoCita = 'PENDIENTE_PAGO' | 'CONFIRMADA' | 'EN_COLA' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA' | 'RECHAZADA' | 'NO_ASISTIO';
export interface Cita {
  id: string; barberia_id: string; barbero_id: string; cliente_id: string | null; servicio_id: string | null;
  tipo: 'ONLINE' | 'WALKIN'; nombre_walkin: string | null; fecha_hora: string; fecha_fin: string; estado: EstadoCita;
  precio: number; metodo_pago: string | null; comprobante_pago_url: string | null; verificado_pago: boolean;
  foto_corte_url: string | null; created_at: string;
  clientes?: Pick<Cliente, 'nombre' | 'dni' | 'telefono' | 'estado_verificacion'> | null;
  servicios_cortes?: Pick<Servicio, 'nombre'> | null;
  barberos?: Pick<Barbero, 'nombre'> | null;
}
export interface Premio { id: string; barberia_id: string; barbero_id: string | null; meta_cortes: number; tipo_premio: 'DESCUENTO' | 'GRATIS'; valor_descuento: number; descripcion?: string | null; activo: boolean }

export const ESTADOS: Record<EstadoBarbero, { texto: string; emoji: string; color: string }> = {
  LIBRE: { texto: 'Libre', emoji: '🟢', color: '#22c55e' },
  CORTANDO_CITA: { texto: 'Atendiendo cita', emoji: '✂️', color: '#ef4444' },
  CORTANDO_WALKIN: { texto: 'Atendiendo sin cita', emoji: '🚶', color: '#f59e0b' },
  DESCANSO: { texto: 'Descanso', emoji: '☕', color: '#60a5fa' },
};

export const ESTADOS_CITA: Record<EstadoCita, { texto: string; clase: string }> = {
  PENDIENTE_PAGO: { texto: 'Pago por validar', clase: 'text-amber-500' },
  CONFIRMADA: { texto: 'Confirmada', clase: 'text-acento-500' },
  EN_COLA: { texto: 'En cola', clase: 'text-sky-500' },
  EN_CURSO: { texto: 'En curso', clase: 'text-red-500' },
  COMPLETADA: { texto: 'Completada', clase: 'text-green-500' },
  CANCELADA: { texto: 'Cancelada', clase: 'text-base-400' },
  RECHAZADA: { texto: 'Pago rechazado', clase: 'text-red-400' },
  NO_ASISTIO: { texto: 'No asistió', clase: 'text-base-400' },
};

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`;
