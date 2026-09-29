import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Case, Result } from './cases.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '.cache', 'oracle');

export function goAvailable(): boolean {
  return spawnSync('go', ['version'], { timeout: 20_000 }).status === 0;
}

function build(): void {
  mkdirSync(join(here, '.cache'), { recursive: true });
  const r = spawnSync('go', ['build', '-o', bin, '.'], { cwd: here, timeout: 240_000, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('go build failed: ' + r.stderr);
}

/** Runs cases through real Go. Uses the tzdata bundled with the Go toolchain. */
export function runGo(cases: Case[]): Result[] {
  if (!existsSync(bin)) build();
  const goroot = spawnSync('go', ['env', 'GOROOT'], { encoding: 'utf8', timeout: 20_000 }).stdout.trim();
  const r = spawnSync(bin, [], {
    input: JSON.stringify(cases),
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    timeout: 300_000,
    env: { ...process.env, ZONEINFO: join(goroot, 'lib', 'time', 'zoneinfo.zip'), TZ: 'UTC' },
  });
  if (r.status !== 0) throw new Error('oracle failed: ' + r.stderr);
  return JSON.parse(r.stdout) as Result[];
}
