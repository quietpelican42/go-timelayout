import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { evalCase, same } from '../oracle/cases.ts';
import type { Case, Result } from '../oracle/cases.ts';

// Expected values in the fixture were produced by real Go (see oracle/fixture.ts).
const fx = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/oracle.json.gz', import.meta.url))).toString()) as {
  cases: Case[];
  results: Result[];
};

test('fixture is well formed', () => {
  assert.equal(fx.cases.length, fx.results.length);
  assert.ok(fx.cases.length > 6000);
});

for (const kind of ['f', 'p'] as const) {
  test(`every ${kind === 'f' ? 'Format' : 'Parse'} case in the fixture matches Go`, () => {
    let n = 0;
    const bad: string[] = [];
    fx.cases.forEach((c, i) => {
      if (c[0] !== kind) return;
      n++;
      const js = evalCase(c);
      if (!same(js, fx.results[i]!) && bad.length < 5) {
        bad.push(JSON.stringify({ case: c, go: fx.results[i], js }));
      }
    });
    assert.ok(n > 2000);
    assert.deepEqual(bad, []);
  });
}

test('the fixture exercises accepted and rejected parses', () => {
  const kinds = new Set<string>();
  fx.cases.forEach((c, i) => {
    if (c[0] === 'p') kinds.add(fx.results[i]![0]);
  });
  assert.deepEqual([...kinds].sort(), ['e', 't']);
});
