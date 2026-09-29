// Compares this library and two npm packages with real Go output, using the predefined-layout
// grid stored in test/fixtures/oracle.json.gz (39 layouts x 9 instants x 5 offsets).
//
//   mkdir -p bench/.incumbents && cd bench/.incumbents && npm init -y \
//     && npm install @ahxar/go-time@1.1.6 locutus@3.0.36 && cd ../..
//   node bench/incumbents.ts
//
// locutus formats JS Dates in UTC only, so it is scored on the UTC subset.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import type { Case, Result } from '../oracle/cases.ts';
import * as mine from '../src/index.ts';

const here = new URL('.', import.meta.url).pathname;
if (!existsSync(here + '.incumbents/node_modules')) {
  console.error('SKIP: install the incumbents first, see the header of bench/incumbents.ts');
  process.exit(0);
}
const req = createRequire(here + '.incumbents/');
const fx = JSON.parse(gunzipSync(readFileSync(here + '../test/fixtures/oracle.json.gz')).toString()) as {
  cases: Case[];
  results: Result[];
};
const grid = fx.cases.slice(0, 3510); // grid Format cases, then grid Parse cases
const gridResults = fx.results.slice(0, 3510);
const n = 1755;

interface Impl {
  name: string;
  utcOnly: boolean;
  format(layout: string, ms: number, off: number): string;
  parse(layout: string, value: string): number; // epoch ms
}

const ahxar = req('@ahxar/go-time');
const locutus = req('locutus/golang/time/index');
const impls: Impl[] = [
  {
    name: 'go-timelayout',
    utcOnly: false,
    format: (l, ms, off) =>
      mine.format(mine.unix(BigInt(Math.floor(ms / 1000)), (ms % 1000) * 1_000_000, off === 0 ? mine.UTC : mine.fixedZone('', off)), l),
    parse: (l, v) => Number(mine.parse(l, v).epochNanos / 1_000_000n),
  },
  {
    name: '@ahxar/go-time 1.1.6',
    utcOnly: false,
    format: (l, ms, off) => ahxar.unixMilli(BigInt(ms)).in(off === 0 ? ahxar.UTC : ahxar.fixedZone('', off)).format(l),
    parse: (l, v) => Number(ahxar.parse(l, v).unixMilli()),
  },
  {
    name: 'locutus 3.0.36 golang/time',
    utcOnly: true,
    format: (l, ms) => locutus.Format(new Date(ms), l),
    parse: (l, v) => {
      let r = locutus.Parse(l, v);
      if (Array.isArray(r)) r = r[0];
      return r instanceof Date ? r.getTime() : Number(r?.getTime?.());
    },
  },
];

console.log('implementation'.padEnd(30), 'Format'.padEnd(20), 'Parse round trip (Go-accepted)');
for (const impl of impls) {
  let f = 0, ft = 0, p = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    const c = grid[i] as ['f', string, string, 'UTC' | ['fixed', string, number]];
    const off = c[3] === 'UTC' ? 0 : c[3][2];
    if (impl.utcOnly && off !== 0) continue;
    const ms = Number(BigInt(c[2]) / 1_000_000n);
    const want = gridResults[i]![1];
    ft++;
    try {
      if (impl.format(c[1], ms, off) === want) f++;
    } catch {}
    const pr = gridResults[n + i]!;
    if (pr[0] === 't') {
      pt++;
      try {
        if (impl.parse(c[1], want as string) === Number(BigInt(pr[1] as string) / 1_000_000n)) p++;
      } catch {}
    }
  }
  const pct = (a: number, b: number): string => `${a}/${b} = ${((100 * a) / b).toFixed(1)}%`;
  console.log(impl.name.padEnd(30), pct(f, ft).padEnd(20), pct(p, pt));
}
