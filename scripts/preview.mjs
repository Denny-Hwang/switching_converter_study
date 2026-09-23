/**
 * Serve the built site (dist/) with `astro preview` for the browser scripts
 * (keyboard_check.mjs, screenshots.mjs). Resolves once the base URL answers.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BASE_PATH = '/switching_converter_study';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function startPreview(port = 4329) {
  const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}${BASE_PATH}`;
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`astro preview exited early:\n${log}`);
    try {
      const r = await fetch(`${base}/`);
      if (r.ok) return { base, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`astro preview did not answer at ${base}/ within 60 s:\n${log}`);
}
