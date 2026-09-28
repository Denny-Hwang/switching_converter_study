#!/usr/bin/env node
/**
 * postbuild.mjs -- makes the built site (dist/) the same wherever the repository is checked out, so that
 * a fresh clone builds an identical site (docs/BUILD_SPEC.md, Phase 5). `npm run build` runs it right
 * after `astro build`. Two parts of the output depend on the build rather than on the sources:
 *
 * - an island's uid (<astro-island uid="...">): Astro hashes the component's absolute file path into it,
 *   so a checkout at another path gives other uids. Nothing reads the uid (the island runtime reads the
 *   island's other attributes), so each becomes a hash of the page, the island's place on the page and
 *   its component, the same on every machine;
 * - pagefind/pagefind-entry.json: Pagefind writes its languages in no fixed order; they are sorted.
 *
 * scripts/repro_check.sh checks the result: HEAD's files at another path build the same dist/.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

if (!fs.existsSync(DIST)) {
  console.error('postbuild: no dist/ (run astro build first)');
  process.exit(1);
}

let islands = 0;
let pages = 0;
for (const file of htmlFiles(DIST)) {
  const page = path.relative(DIST, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  let k = 0;
  const out = html.replace(/<astro-island\b[^>]*>/g, (tag) => {
    const url = /\scomponent-url="([^"]*)"/.exec(tag)?.[1] ?? '';
    const uid = createHash('sha256').update(`${page}\n${k++}\n${url}`).digest('base64url').slice(0, 8);
    return tag.replace(/\suid="[^"]*"/, ` uid="${uid}"`);
  });
  if (k) {
    islands += k;
    pages += 1;
  }
  if (out !== html) fs.writeFileSync(file, out);
}

const entry = path.join(DIST, 'pagefind', 'pagefind-entry.json');
let languages = 0;
if (fs.existsSync(entry)) {
  const j = JSON.parse(fs.readFileSync(entry, 'utf8'));
  if (j.languages) {
    languages = Object.keys(j.languages).length;
    j.languages = Object.fromEntries(Object.keys(j.languages).sort().map((l) => [l, j.languages[l]]));
    fs.writeFileSync(entry, JSON.stringify(j));
  }
}

console.log(`postbuild: ${islands} island uid(s) on ${pages} page(s) made independent of the checkout's path; ${languages} Pagefind language(s) sorted`);
