// Differential run against real Go.
//
//   node oracle/run.ts [--n 20000] [--seed 1] [--iana] [--fixture test/fixtures/oracle.json --fixture-size 2500]
//
// Generates N format cases and N parse cases (parse values derived from Go's own
// Format output, then mutated), runs both through Go and through this library,
// and prints the agreement. Exits 1 on any mismatch.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { evalCase, IANA_ZONES, parseCaseFrom, randomLayout, randomNanos, randomZone, Rng, same } from './cases.ts';
import type { Case, FormatCase, ParseCase, Result } from './cases.ts';
import { goAvailable, runGo } from './go.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const N = Number(opt('n', '20000'));
const seed = Number(opt('seed', '1'));
const iana = args.includes('--iana');
const fixturePath = opt('fixture', '');
const fixtureSize = Number(opt('fixture-size', '2500'));

if (!goAvailable()) {
  console.error('SKIP: `go` is not on PATH, so there is no oracle to compare against.');
  process.exit(0);
}

const rng = new Rng(seed);
const formatCases: FormatCase[] = [];
for (let i = 0; i < N; i++) {
  formatCases.push(['f', randomLayout(rng, iana), randomNanos(rng), randomZone(rng, iana)]);
}
const formatGo = runGo(formatCases);
const parseCases: ParseCase[] = formatCases.map((c, i) => {
  const r = formatGo[i]!;
  return parseCaseFrom(rng, c[1], r[0] === 's' ? r[1] : '', iana);
});
const parseGo = runGo(parseCases);

const all: Case[] = [...formatCases, ...parseCases];
const expected: Result[] = [...formatGo, ...parseGo];

const stats: Record<'f' | 'p', [number, number]> = { f: [0, 0], p: [0, 0] };
const parseOk: [number, number] = [0, 0]; // among Go-successful parses: matched, total
const parseErr: [number, number] = [0, 0]; // among Go-error parses
const byZone = new Map<string, [number, number]>();
let instantWrong = 0; // parse accepted by both but a different instant or offset
let nameOnly = 0; // parse accepted by both, same instant and offset, different zone name
const bad: Array<{ case: Case; go: Result; js: Result }> = [];
for (let i = 0; i < all.length; i++) {
  const c = all[i]!;
  const js = evalCase(c);
  const ok = same(js, expected[i]!);
  const st = stats[c[0]];
  st[1]++;
  if (ok) st[0]++;
  else if (bad.length < 25) bad.push({ case: c, go: expected[i]!, js });
  if (c[0] === 'p') {
    const want = expected[i]!;
    if (!ok && want[0] === 't' && js[0] === 't') {
      if (want[1] !== js[1] || want[2] !== js[2]) instantWrong++;
      else nameOnly++;
    }
    const bucket = expected[i]![0] === 'e' ? parseErr : parseOk;
    bucket[1]++;
    if (ok) bucket[0]++;
  }
  if (iana && Array.isArray(c[3]) && c[3][0] === 'iana') {
    const z = byZone.get(`${c[3][1]}`) ?? [0, 0];
    z[1]++;
    if (ok) z[0]++;
    byZone.set(`${c[3][1]}`, z);
  }
}
const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : ((100 * a) / b).toFixed(3) + '%');
console.log(`seed ${seed}, mode ${iana ? 'iana' : 'utc+fixed'}`);
console.log(`format: ${stats.f[0]}/${stats.f[1]} = ${pct(...stats.f)}`);
console.log(`parse:  ${stats.p[0]}/${stats.p[1]} = ${pct(...stats.p)}`);
console.log(`  Go accepted: ${parseOk[0]}/${parseOk[1]}; Go rejected (message compared): ${parseErr[0]}/${parseErr[1]}`);
if (iana) {
  console.log(`  parse accepted by both but different: instant or offset ${instantWrong}, zone name only ${nameOnly}`);
  for (const z of IANA_ZONES) {
    const s = byZone.get(z);
    if (s) console.log(`  ${z.padEnd(22)} ${s[0]}/${s[1]} = ${pct(...s)}`);
  }
}
for (const b of bad.slice(0, 12)) console.log(JSON.stringify(b));

if (fixturePath && !iana) {
  // Keep every Go-accepted parse and a spread of the rest, in compact form.
  const pick: Array<[Case, Result]> = [];
  const step = Math.max(1, Math.floor(all.length / fixtureSize));
  for (let i = 0; i < all.length; i += step) pick.push([all[i]!, expected[i]!]);
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, JSON.stringify({ generator: `oracle/run.ts --seed ${seed}`, cases: pick }) + '\n');
  console.log(`wrote ${pick.length} fixture cases to ${fixturePath}`);
}
process.exit(stats.f[0] + stats.p[0] === all.length ? 0 : 1);
