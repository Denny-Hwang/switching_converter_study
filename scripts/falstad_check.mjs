// falstad_check.mjs -- run every CircuitJS1 share link of the SPICE library in a browser and compare
// the averages, largest and smallest values of its last periods with the catalogue's ideal equations
// (src/generated/falstad.json, written by scripts/falstad_library.py).
//
//   node scripts/falstad_check.mjs                  # the links as they are, on falstad.com
//   node scripts/falstad_check.mjs --serve DIR      # the same circuits in a CircuitJS1 build served from DIR
//   node scripts/falstad_check.mjs --case buck-ccm  # one case
//
// Each circuit runs from the start state its link carries (the analytic steady state's values) for as
// many switching periods as the SPICE library's run of the same case, or longer when the page took long
// to hand over control, then CircuitJS1's JavaScript interface (window.CircuitJS1) is sampled at every
// time step over the last PERIODS_MEASURED periods. Each value must lie within TOL of its quantity's
// scale, its largest magnitude in those periods, as in scripts/sim_library.py. It opens each case's
// check_link, the same circuit with only the header's simulation speed raised, so that the run takes
// seconds rather than minutes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/falstad.json'), 'utf8'));
const PERIODS_MEASURED = 2;
// falstad.com over the network: a page that does not load is tried again
const ATTEMPTS = 3;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const serveDir = opt('--serve');
const only = opt('--case');

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.gif': 'image/gif' };
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = path.join(root, decodeURIComponent(u.pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runCase(browser, c, base) {
  const url = base ? c.check_link.replace(data.app, base) : c.check_link;
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.CircuitJS1 && window.CircuitJS1.getTime, null, { timeout: 90000 });
    const result = await page.evaluate(
      ({ periods, Ts, n, measure }) =>
        new Promise((resolve) => {
          const sim = window.CircuitJS1;
          // the circuit runs from the moment the page loads, before this callback is installed: on a slow
          // runner it may already be near or past the case's run, so the measured periods start one period
          // after the time found here at the earliest, and every one of them is seen whole
          const tEnd = Math.max(periods * Ts, (Math.ceil(sim.getTime() / Ts) + n + 1) * Ts);
          const elms = sim.getElements();
          const read = {};
          for (const [k, m] of Object.entries(measure)) {
            if (m.node) read[k] = () => sim.getNodeVoltage(m.node);
            else read[k] = () => m.sign * elms[m.element].getCurrent();
          }
          const tStart = tEnd - n * Ts;
          const acc = {}, max = {}, min = {};
          let lastT = null, last = null, lastWall = Date.now(), lastSimT = 0;
          const finish = (t, why) => {
            sim.ontimestep = null;
            sim.setSimRunning(false);
            const avg = {};
            for (const k in acc) avg[k] = acc[k] / (t - tStart);
            resolve({ t, avg, max, min, why });
          };
          // a simulation that stops (CircuitJS1 halts on a singular matrix or a convergence failure)
          const watchdog = setInterval(() => {
            const t = sim.getTime();
            if (t === lastSimT && Date.now() - lastWall > 20000) {
              clearInterval(watchdog);
              finish(t, 'stalled');
            }
            if (t !== lastSimT) {
              lastSimT = t;
              lastWall = Date.now();
            }
          }, 2000);
          sim.ontimestep = () => {
            const t = sim.getTime();
            const s = {};
            for (const k in read) s[k] = read[k]();
            if (t > tStart && lastT !== null) {
              const dt = t - Math.max(lastT, tStart);
              for (const k in s) {
                acc[k] = (acc[k] || 0) + (dt * (s[k] + last[k])) / 2;
                max[k] = Math.max(max[k] ?? -Infinity, s[k]);
                min[k] = Math.min(min[k] ?? Infinity, s[k]);
              }
            }
            lastT = t;
            last = s;
            if (t >= tEnd) {
              clearInterval(watchdog);
              finish(t, 'done');
            }
          };
          sim.setSimRunning(true);
        }),
      { periods: c.periods, Ts: c.Ts, n: PERIODS_MEASURED, measure: c.measure },
    );
    return { result, problems };
  } finally {
    await page.close();
  }
}

function compare(c, r) {
  const errors = [];
  const rows = [];
  for (const [key, want] of Object.entries(c.expected)) {
    const [q, fn] = [key.replace(/_(avg|max|min)$/, ''), key.match(/_(avg|max|min)$/)[1]];
    const got = r[fn]?.[q];
    if (got === undefined) {
      errors.push(`${c.id}: ${key} not measured`);
      continue;
    }
    const scale = Math.max(Math.abs(r.max[q]), Math.abs(r.min[q]), 1e-12);
    const bad = Math.abs(got - want.value) > data.tol * scale;
    rows.push(`    ${key.padEnd(10)} ${got.toPrecision(6).padStart(12)}  ideal ${want.value.toPrecision(6).padStart(12)}  (${(((got - want.value) / scale) * 100).toFixed(2)} % of ${scale.toPrecision(4)})${bad ? '  <-- beyond ' + data.tol * 100 + ' %' : ''}`);
    if (bad) errors.push(`${c.id}: ${key} = ${got.toPrecision(6)} in CircuitJS1, ${want.value.toPrecision(6)} from ${want.from}`);
  }
  return { errors, rows };
}

if (only && !data.cases.some((c) => c.id === only)) {
  console.log(`falstad_check: no case "${only}" (${data.cases.map((c) => c.id).join(', ')})`);
  process.exit(1);
}
const server = serveDir ? await serve(serveDir) : null;
const base = server ? `http://127.0.0.1:${server.address().port}/circuitjs.html` : null;
const browser = await chromium.launch();
const errors = [];
try {
  for (const c of data.cases) {
    if (only && c.id !== only) continue;
    let outcome;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        outcome = await runCase(browser, c, base);
        break;
      } catch (e) {
        console.log(`  ${c.id}: attempt ${attempt} failed: ${e.message.split('\n')[0]}`);
        if (attempt === ATTEMPTS) outcome = { error: e.message.split('\n')[0] };
      }
    }
    if (outcome.error) {
      errors.push(`${c.id}: could not run: ${outcome.error}`);
      continue;
    }
    const { result, problems } = outcome;
    if (result.why !== 'done') errors.push(`${c.id}: the simulation stopped at t = ${result.t} s (${result.why})`);
    for (const p of problems) errors.push(`${c.id}: page error: ${p}`);
    const { errors: e, rows } = compare(c, result);
    console.log(`  ${c.id}: ${Math.round(result.t / c.Ts)} periods to t = ${result.t.toPrecision(6)} s`);
    for (const row of rows) console.log(row);
    errors.push(...e);
  }
} finally {
  await browser.close();
  server?.close();
}
if (errors.length) {
  for (const e of errors) console.log('  ' + e);
  console.log(`falstad_check: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`falstad_check: OK (${only ? 1 : data.cases.length} circuit(s) against the ideal equations within ${data.tol * 100} % of each quantity's scale, on ${base ?? data.app})`);
