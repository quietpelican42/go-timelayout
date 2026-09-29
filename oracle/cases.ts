// Deterministic case generators and the JS-side evaluator for the Go oracle.
// A case is a JSON-friendly array; see main.go for the shape.

import { fixedZone, format, inLocation, loadLocation, parse, parseInLocation, UTC } from '../src/index.ts';
import type { Location } from '../src/index.ts';

export type Zone = 0 | 'UTC' | ['fixed', string, number] | ['iana', string];
export type FormatCase = ['f', string, string, Zone];
export type ParseCase = ['p', string, string, Zone];
export type Case = FormatCase | ParseCase;
export type Result = ['s', string] | ['e', string] | ['t', string, number, string];

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

const ELEMENTS = [
  'Jan', 'January', 'Mon', 'Monday', '1', '01', '2', '02', '_2', '__2', '002', '15', '3', '03', '4', '04', '5', '05',
  '2006', '06', 'PM', 'pm', 'MST', 'Z07:00', 'Z0700', 'Z07', 'Z070000', 'Z07:00:00', '-07:00', '-0700', '-07', '-070000',
  '-07:00:00', '.000', '.0', '.00', '.000000', '.000000000', '.999', '.9', '.999999999', ',000', ',9', ',999999',
  '.0000000000', '_2006', 'Janx', 'Monx', 'Mond', '0', '00', '9', '.', ',', '.x', '.09', '.90',
];
const LITERALS = [' ', ' ', '-', ':', '/', ',', '.', 'T', 'at', 'x', 'é', "'", '"', '_', 'Z', 'UTC', '%', '\t', '€', '  ', '', 'ay', 'h', 'm', 's'];
const DATES = [
  '2006-01-02', '2006/1/2', '02/01/06', 'Jan _2 2006', 'Monday, January 2, 2006', 'Mon Jan 2', '2 Jan 2006', '20060102',
  '2006-002', '06-__2', 'January 2', 'Jan 2, 06', '1/2/06', '2006-1-2', 'Mon, 02 Jan 2006', '02-Jan-06', '_2/01', '2006', 'Jan', '__2 2006',
];
const TIMES = [
  '15:04:05', '3:04:05 PM', '03:04:05pm', '15:04', '3:04PM', '150405', '15h04m05s', '4:5', '3PM', '03:04:05 PM', '15:4:5', '05', '15',
];
const FRACS = ['', '', '', '.000', '.999999999', ',000', '.9', '.000000', '.00', '.999', ',999'];
const ZONES = [
  '', '', '', 'Z07:00', 'Z0700', '-0700', '-07:00', '-07', 'MST', 'Z07', '-070000', 'Z07:00:00', '-07:00:00', 'Z070000', ' MST', ' -0700 MST', ' Z07:00', ' -07:00',
];
const SEPS = [' ', ' ', 'T', ', ', ' at ', '-', '_', '  '];

export function randomLayout(rng: Rng, needZone = false): string {
  if (rng.chance(0.6)) {
    const parts = [rng.pick(DATES), rng.pick(SEPS), rng.pick(TIMES), rng.pick(FRACS), rng.pick(ZONES)];
    if (rng.chance(0.15)) parts.reverse();
    if (rng.chance(0.15)) parts.splice(rng.int(0, 2), 1);
    let l = parts.join('');
    if (needZone && !/MST|Z07|-07/.test(l)) l += rng.pick([' MST', ' -07:00', 'Z07:00', ' -0700 MST']);
    return l;
  }
  const n = rng.int(1, 8);
  let l = '';
  for (let i = 0; i < n; i++) l += rng.chance(0.65) ? rng.pick(ELEMENTS) : rng.pick(LITERALS);
  if (needZone) l += rng.pick([' MST', ' -07:00', ' Z07:00', ' -0700 MST']);
  return l;
}

const SEC_MIN = -62167219200; // 0000-01-01
const SEC_MAX = 253402300799; // 9999-12-31 23:59:59

export function randomNanos(rng: Rng, wide = true): string {
  let sec: number;
  const r = rng.next();
  if (r < 0.35) sec = rng.int(SEC_MIN, SEC_MAX);
  else if (r < 0.75) sec = rng.int(-2208988800, 2208988800); // 1900..2040
  else if (r < 0.85) sec = rng.pick([SEC_MIN, SEC_MAX, 0, -1, 1, 951782400, 951868799, 1078099200, 4102444799, -62162035200]) + rng.int(-2, 2);
  else if (r < 0.93 || !wide) sec = rng.int(-86400 * 366 * 3, 86400 * 366 * 3);
  else sec = rng.int(-62167219200 * 3, 253402300799 * 3); // years about -5800 .. 29700
  let nsec: number;
  const q = rng.next();
  if (q < 0.3) nsec = 0;
  else if (q < 0.5) nsec = rng.int(0, 999) * 1_000_000;
  else if (q < 0.6) nsec = rng.int(0, 99) * 10_000_000;
  else nsec = rng.int(0, 999_999_999);
  return (BigInt(sec) * 1_000_000_000n + BigInt(nsec)).toString();
}

const FIXED_NAMES = ['', '', '', 'EST', 'PST', 'CET', 'GMT', 'UTC', 'MST', '+03', 'XYZT', 'é', 'A B'];
export function randomFixed(rng: Rng): Zone {
  const r = rng.next();
  let off: number;
  if (r < 0.15) off = 0;
  else if (r < 0.5) off = rng.int(-14, 14) * 3600;
  else if (r < 0.65) off = rng.int(-28, 28) * 1800;
  else if (r < 0.75) off = rng.pick([-12600, 19800, 20700, 34200, 45900]);
  else off = rng.int(-26 * 3600, 26 * 3600);
  return ['fixed', rng.pick(FIXED_NAMES), off];
}

export const IANA_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'America/Mexico_City', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Cairo', 'Asia/Kathmandu',
];

export function randomZone(rng: Rng, iana: boolean): Zone {
  if (iana) return ['iana', rng.pick(IANA_ZONES)];
  const r = rng.next();
  return r < 0.2 ? 'UTC' : randomFixed(rng);
}

const ALPHABET = '0123456789 :-/,.TZzAPMapmJFDEWMonTueSat+_éUTCESTPGM';
function mutate(s: string, rng: Rng): string {
  const k = rng.int(1, 3);
  for (let i = 0; i < k; i++) {
    const r = rng.next();
    if (s.length === 0) return rng.pick(['0', ' ', 'x']);
    const at = rng.int(0, s.length - 1);
    if (r < 0.3) s = s.slice(0, at) + rng.pick([...ALPHABET]) + s.slice(at + 1);
    else if (r < 0.4) s = s.slice(0, at) + s.slice(at + 1);
    else if (r < 0.5) s = s.slice(0, at) + rng.pick([...ALPHABET]) + s.slice(at);
    else if (r < 0.6) s = s.slice(0, at);
    else if (r < 0.7) s += rng.pick(['.123', ',5', ' x', ' ', '.', '000', 'Z']);
    else if (r < 0.85) s = s.replace(/\d\d/, rng.pick(['99', '60', '13', '32', '00', '24', '61', '25', '366', '0']));
    else s = s.replace(/[AP]M|[ap]m/, (m) => rng.pick(['AM', 'PM', 'am', 'pm', 'Am', m]));
  }
  return s;
}

export function randomValue(rng: Rng): string {
  const n = rng.int(0, 24);
  let v = '';
  for (let i = 0; i < n; i++) v += rng.pick([...ALPHABET]);
  return v;
}

/** Derives a parse case from a format case's output. */
export function parseCaseFrom(rng: Rng, layout: string, formatted: string, iana: boolean): ParseCase {
  let value = formatted;
  const r = rng.next();
  if (r < 0.45) value = mutate(value, rng);
  else if (r < 0.5) value = randomValue(rng);
  let zone: Zone;
  const z = rng.next();
  if (iana) zone = z < 0.2 ? 0 : ['iana', rng.pick(IANA_ZONES)];
  else zone = z < 0.3 ? 0 : z < 0.45 ? 'UTC' : randomFixed(rng);
  return ['p', layout, value, zone];
}

function toLocation(z: Zone): Location {
  if (z === 'UTC' || z === 0) return UTC;
  if (z[0] === 'fixed') return fixedZone(z[1], z[2]);
  return loadLocation(z[1]);
}

export function evalCase(c: Case): Result {
  try {
    if (c[0] === 'f') {
      return ['s', format(inLocation(BigInt(c[2]), toLocation(c[3])), c[1])];
    }
    const t = c[3] === 0 ? parse(c[1], c[2]) : parseInLocation(c[1], c[2], toLocation(c[3]));
    return ['t', t.epochNanos.toString(), t.offsetSeconds, t.zoneName];
  } catch (e) {
    if (e instanceof Error && e.name === 'ParseError') return ['e', e.message];
    return ['e', 'JS THROW ' + String(e)];
  }
}

export const same = (a: Result, b: Result): boolean => JSON.stringify(a) === JSON.stringify(b);
