import assert from 'node:assert/strict';
import { rangoDe, desplazar, diasTranscurridos, etiquetaPeriodo } from './periodo';

// 2026-10-28 es miércoles: la semana va del lunes 26 al domingo 1 de noviembre.
assert.deepEqual(rangoDe('semana', '2026-10-28'), { desde: '2026-10-26', hasta: '2026-11-02', dias: 7 }, 'semana mitad de mes');
assert.deepEqual(rangoDe('semana', '2026-11-01'), { desde: '2026-10-26', hasta: '2026-11-02', dias: 7 }, 'domingo pertenece a su semana');
assert.deepEqual(rangoDe('mes', '2026-10-28'), { desde: '2026-10-01', hasta: '2026-11-01', dias: 31 }, 'octubre');
assert.deepEqual(rangoDe('mes', '2026-02-10'), { desde: '2026-02-01', hasta: '2026-03-01', dias: 28 }, 'febrero');
assert.deepEqual(rangoDe('dia', '2026-12-31'), { desde: '2026-12-31', hasta: '2027-01-01', dias: 1 }, 'cambio de año');

assert.equal(desplazar('dia', '2026-03-01', -1), '2026-02-28');
assert.equal(desplazar('semana', '2026-10-28', 1), '2026-11-04');
assert.equal(desplazar('mes', '2026-01-31', -1), '2025-12-01');
assert.equal(desplazar('mes', '2026-10-15', 1), '2026-11-01');

// Ritmo: en el mes en curso solo cuentan los días ya vividos.
assert.equal(diasTranscurridos(rangoDe('mes', '2026-11-05'), '2026-10-27'), 1, 'periodo futuro: mínimo 1');
assert.equal(diasTranscurridos(rangoDe('mes', '2026-10-28'), '2026-10-28'), 28, 'mes en curso, hoy incluido');
assert.equal(diasTranscurridos(rangoDe('mes', '2026-09-10'), '2026-10-28'), 30, 'mes cerrado: todos sus días');
assert.equal(diasTranscurridos(rangoDe('semana', '2026-10-28'), '2026-10-28'), 3, 'semana en curso');

assert.match(etiquetaPeriodo('mes', '2026-10-28'), /octubre de 2026/i);
assert.match(etiquetaPeriodo('semana', '2026-10-28'), /26 oct/);
console.log('periodo ok');
