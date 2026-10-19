import assert from 'node:assert/strict';
import { temaActivo, temaAuto, TEMAS } from './festivo.ts';

const f = (s: string) => new Date(s + 'T12:00:00');

// Rangos por fecha
assert.equal(temaAuto(f('2026-10-31')), TEMAS.halloween);
assert.equal(temaAuto(f('2026-10-24')), TEMAS.halloween);
assert.equal(temaAuto(f('2026-10-23')), null, 'un día antes, nada');
assert.equal(temaAuto(f('2026-12-25')), TEMAS.navidad);
assert.equal(temaAuto(f('2026-12-31')), TEMAS.anio_nuevo, '31/dic ya es año nuevo');
assert.equal(temaAuto(f('2027-01-01')), TEMAS.anio_nuevo);
assert.equal(temaAuto(f('2026-07-28')), TEMAS.fiestas_patrias);
assert.equal(temaAuto(f('2026-02-14')), TEMAS.san_valentin);
assert.equal(temaAuto(f('2026-03-15')), null, 'fuera de temporada');

// Resolución del valor guardado
assert.equal(temaActivo('ninguno', f('2026-10-31')), null, 'ninguno apaga aunque sea Halloween');
assert.equal(temaActivo('navidad', f('2026-03-15')), TEMAS.navidad, 'fijo manda sobre la fecha');
assert.equal(temaActivo('auto', f('2026-10-31')), TEMAS.halloween);
assert.equal(temaActivo(undefined, f('2026-03-15')), null, 'sin valor = auto');
assert.equal(temaActivo('basura', f('2026-10-31')), TEMAS.halloween, 'valor desconocido cae a auto');

console.log('festivo.test.ts ✓');
