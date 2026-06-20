import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

export const CONFORMANCE_CLI = resolve(
  REPO_ROOT,
  'vendor/ard-spec/conformance/bin/conformance-test',
);

/** Prefer the vendored venv python (has jsonschema for strict checks), else system python3. */
export function pythonBin(): string {
  const venv = resolve(REPO_ROOT, 'vendor/.venv/bin/python');
  return existsSync(venv) ? venv : 'python3';
}

export interface ConformanceRun {
  ok: boolean;
  exitCode: number;
  stdout: string;
}

/** Run `conformance-test <mode> <target>` and return PASS/FAIL by exit code. */
export function runConformance(mode: 'manifest' | 'registry', target: string): ConformanceRun {
  const res = spawnSync(pythonBin(), [CONFORMANCE_CLI, mode, target], {
    encoding: 'utf8',
  });
  const stdout = (res.stdout ?? '') + (res.stderr ?? '');
  return { ok: res.status === 0, exitCode: res.status ?? -1, stdout };
}
