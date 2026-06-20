import { spawn, spawnSync } from 'node:child_process';
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

/**
 * Run `conformance-test <mode> <target>` synchronously. Use for `manifest` mode only.
 * NOT for `registry`: spawnSync blocks the Node event loop, so an in-process server
 * under test could not answer the probe — use runConformanceAsync there.
 */
export function runConformance(mode: 'manifest' | 'registry', target: string): ConformanceRun {
  const res = spawnSync(pythonBin(), [CONFORMANCE_CLI, mode, target], {
    encoding: 'utf8',
  });
  const stdout = (res.stdout ?? '') + (res.stderr ?? '');
  return { ok: res.status === 0, exitCode: res.status ?? -1, stdout };
}

/**
 * Async variant: spawns the probe without blocking the event loop, so an in-process
 * Fastify server can serve the conformance requests concurrently.
 */
export function runConformanceAsync(
  mode: 'manifest' | 'registry',
  target: string,
): Promise<ConformanceRun> {
  return new Promise((resolvePromise) => {
    const child = spawn(pythonBin(), [CONFORMANCE_CLI, mode, target]);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => {
      resolvePromise({ ok: code === 0, exitCode: code ?? -1, stdout: out });
    });
  });
}
