// Regenerates test/fixtures/oracle.json.gz from real Go.
//
//   node oracle/fixture.ts [--seed 20260929] [--random 3000]
//
// Contents: the predefined-layout grid (every layout x instant x offset, Format,
// then Parse of Go's own output) plus a random sample from the differential generator.

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseCaseFrom, randomLayout, randomNanos, randomZone, Rng } from './cases.ts';
import type { Case, FormatCase, ParseCase, Result, Zone } from './cases.ts';
import { goAvailable, runGo } from './go.ts';
import * as g from '../src/index.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const seed = Number(opt('seed', '20260929'));
const nRandom = Number(opt('random', '3000'));

if (!goAvailable()) {
  console.error('SKIP: `go` is not on PATH.');
  process.exit(0);
}

const layouts = [
  g.ANSIC, g.UnixDate, g.RubyDate, g.RFC822, g.RFC822Z, g.RFC850, g.RFC1123, g.RFC1123Z, g.RFC3339, g.RFC3339Nano,
  g.Kitchen, g.Stamp, g.StampMilli, g.StampMicro, g.StampNano, g.DateTime, g.DateOnly, g.TimeOnly,
  '2006-01-02T15:04:05.000Z07:00', '2006-01-02T15:04:05.999999999Z07:00', '2006-01-02T15:04:05,000',
  'Jan _2 06 3:4:5 PM', 'Monday, January 2, 2006', 'Mon Jan 2', '002 __2', '2006-1-2 3:04pm', '15h04m',
  '-07 -0700 -07:00 -070000 Z0700 Z07 Z07:00:00', '06/01/02 03:04:05.00', '02 Jan 06 15:04 MST', '20060102150405',
  '2006.01.02 .0 .9 .99', 'PM pm', 'Jan January Mon Monday', '1 01 2 02 _2 3 03 4 04 5 05 06 2006', 'MST -0700 x',
  "'2006' \"01\"", 'Z', '2006-01-02T15:04:05.999Z',
];
const instantsMs = [0, 1700000000123, 951782400000, 1709164799999, 1583020800500, -86400000, 4102444800999, 1234567890000, 1467331200001];
const offsets = [0, 3600, -18000, 19800, -12600];

const formatCases: FormatCase[] = [];
for (const l of layouts) {
  for (const ms of instantsMs) {
    for (const off of offsets) {
      const zone: Zone = off === 0 ? 'UTC' : ['fixed', '', off];
      formatCases.push(['f', l, (BigInt(ms) * 1_000_000n).toString(), zone]);
    }
  }
}
const gridFormat = runGo(formatCases);
const gridParse: ParseCase[] = formatCases.map((c, i) => ['p', c[1], (gridFormat[i] as ['s', string])[1], 0]);

const rng = new Rng(seed);
const randFormat: FormatCase[] = [];
for (let i = 0; i < nRandom / 2; i++) randFormat.push(['f', randomLayout(rng), randomNanos(rng), randomZone(rng, false)]);
const randFormatGo = runGo(randFormat);
const randParse = randFormat.map((c, i) => parseCaseFrom(rng, c[1], (randFormatGo[i] as ['s', string])[1], false));

const cases: Case[] = [...formatCases, ...gridParse, ...randFormat, ...randParse];
const results: Result[] = [...gridFormat, ...runGo(gridParse), ...randFormatGo, ...runGo(randParse)];
const body = JSON.stringify({ generator: 'oracle/fixture.ts', goVersion: process.env.GOVERSION ?? '', seed, cases, results });
writeFileSync(new URL('../test/fixtures/oracle.json.gz', import.meta.url), gzipSync(body, { level: 9 }));
console.log(`wrote ${cases.length} cases (${gridFormat.length} grid format, ${gridParse.length} grid parse, ${randFormat.length + randParse.length} random)`);
