// Agreement of IANA zone offset and abbreviation with real Go (tzdata bundled with the
// Go toolchain) for 22 common zones over four eras.
//
//   node bench/iana.ts [--per 300] [--seed 3]

import { IANA_ZONES, Rng, evalCase } from '../oracle/cases.ts';
import type { Case, Result } from '../oracle/cases.ts';
import { goAvailable, runGo } from '../oracle/go.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const per = Number(opt('per', '300'));
const rng = new Rng(Number(opt('seed', '3')));

if (!goAvailable()) {
  console.error('SKIP: `go` is not on PATH.');
  process.exit(0);
}

const year = (y: number): number => Date.UTC(2000, 0, 1) / 1000 + (y - 2000) * 31556952;
const eras: Array<[string, number, number]> = [
  ['1970-2040', year(1970), year(2040)],
  ['1900-1970', year(1900), year(1970)],
  ['0000-1900', -62167219200, year(1900)],
  ['2040-9999', year(2040), 253402300799],
];

interface Row {
  zone: string;
  era: string;
  kind: 'offset' | 'name';
}
const cases: Case[] = [];
const rows: Row[] = [];
for (const zone of IANA_ZONES) {
  for (const [era, lo, hi] of eras) {
    for (let i = 0; i < per; i++) {
      const nanos = (BigInt(rng.int(Math.floor(lo), Math.floor(hi))) * 1_000_000_000n).toString();
      cases.push(['f', '-07:00:00', nanos, ['iana', zone]]);
      rows.push({ zone, era, kind: 'offset' });
      cases.push(['f', 'MST', nanos, ['iana', zone]]);
      rows.push({ zone, era, kind: 'name' });
    }
  }
}
const go: Result[] = runGo(cases);
const tally = new Map<string, [number, number]>();
const bump = (k: string, ok: boolean): void => {
  const t = tally.get(k) ?? [0, 0];
  t[1]++;
  if (ok) t[0]++;
  tally.set(k, t);
};
const misses = new Map<string, string>();
cases.forEach((c, i) => {
  const r = rows[i]!;
  const js = evalCase(c);
  const ok = JSON.stringify(js) === JSON.stringify(go[i]);
  bump(`${r.kind} ${r.era}`, ok);
  bump(`${r.kind} all`, ok);
  bump(`${r.kind} zone ${r.zone}`, ok);
  if (!ok && r.kind === 'name' && r.era === '1970-2040') misses.set(`${r.zone} go=${go[i]![1]} js=${js[1]}`, '');
});
const pct = (t: [number, number]): string => `${t[0]}/${t[1]} = ${((100 * t[0]) / t[1]).toFixed(2)}%`;
for (const kind of ['offset', 'name']) {
  console.log(`${kind}:`);
  console.log(`  all eras     ${pct(tally.get(`${kind} all`)!)}`);
  for (const [era] of eras) console.log(`  ${era.padEnd(12)} ${pct(tally.get(`${kind} ${era}`)!)}`);
}
console.log('per zone (offset | name):');
for (const z of IANA_ZONES) {
  console.log(`  ${z.padEnd(22)} ${pct(tally.get(`offset zone ${z}`)!).padEnd(22)} ${pct(tally.get(`name zone ${z}`)!)}`);
}
console.log(`distinct name mismatches in 1970-2040: ${misses.size}`);
for (const m of [...misses.keys()].sort().slice(0, 40)) console.log('  ' + m);
