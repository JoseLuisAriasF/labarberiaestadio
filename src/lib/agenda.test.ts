import assert from 'node:assert/strict';
import { bloquesDelDia, isoDow, abiertoAhora, hoyLima, sumarDias } from './agenda.ts';

const h = { '1': ['09:00', '11:00'], '7': null } as any;
assert.equal(isoDow('2026-10-19'), 1, 'lunes');
assert.equal(isoDow('2026-10-18'), 7, 'domingo');
assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');

const antes = new Date('2026-10-19T00:00:00-05:00');
const b = bloquesDelDia('2026-10-19', h, 30, [], antes);
assert.deepEqual(b.map((x) => x.hora), ['09:00', '09:30', '10:00', '10:30'], 'cabe hasta el cierre');
assert.ok(b.every((x) => x.libre));

// Cita 09:30–10:00 tapa sólo ese bloque; con 60 min tapa también el de 09:00.
const occ = [{ inicio: '2026-10-19T09:30:00-05:00', fin: '2026-10-19T10:00:00-05:00' }];
assert.deepEqual(bloquesDelDia('2026-10-19', h, 30, occ, antes).filter((x) => !x.libre).map((x) => x.hora), ['09:30']);
assert.deepEqual(bloquesDelDia('2026-10-19', h, 60, occ, antes).filter((x) => !x.libre).map((x) => x.hora), ['09:00', '09:30']);

// Pasado y día cerrado
const ya = bloquesDelDia('2026-10-19', h, 30, [], new Date('2026-10-19T09:45:00-05:00'));
assert.equal(ya.find((x) => x.hora === '09:30')!.motivo, 'Ya pasó');
assert.equal(ya.find((x) => x.hora === '10:00')!.libre, true);
assert.deepEqual(bloquesDelDia('2026-10-18', h, 30, [], antes), []);

assert.equal(hoyLima(new Date('2026-10-19T03:00:00Z')), '2026-10-18', '22:00 en Lima sigue siendo domingo');
assert.equal(abiertoAhora(h, new Date('2026-10-19T09:15:00-05:00')), true);
assert.equal(abiertoAhora(h, new Date('2026-10-19T11:00:00-05:00')), false);
console.log('agenda OK');
