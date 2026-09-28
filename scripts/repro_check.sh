#!/usr/bin/env bash
# repro_check.sh -- a fresh copy of the repository builds the same site (docs/BUILD_SPEC.md, Phase 5:
# fresh clone -> npm ci && npm run build -> identical site).
#
# HEAD's tracked files are copied to a new directory elsewhere (git archive: nothing untracked, no
# node_modules, no dist), installed with `npm ci` and built with `npm run build`; the result must equal
# ./dist file for file, byte for byte. Run it on a clean checkout after `npm run build`, as CI does, or
# pass --build to build ./dist first.
#
#     npm run build && bash scripts/repro_check.sh
#     bash scripts/repro_check.sh --build
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
if ! git diff --quiet HEAD --; then
  echo "repro_check: the working tree differs from HEAD; commit or stash first (the copy is HEAD's)" >&2
  exit 2
fi
if [[ "${1:-}" == "--build" ]]; then
  npm run build
fi
if [[ ! -d dist ]]; then
  echo "repro_check: no dist/ (run npm run build, or pass --build)" >&2
  exit 2
fi

tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/repro-XXXXXX")
trap 'rm -rf "$tmp"' EXIT
copy="$tmp/copy"
mkdir -p "$copy"
git archive HEAD | tar -x -C "$copy"
# chained with &&: set -e does not apply inside a subshell whose status `||` tests
(
  cd "$copy" && npm ci --no-audit --no-fund --loglevel=error && npm run build
) >"$tmp/build.log" 2>&1 || {
  tail -n 40 "$tmp/build.log" >&2
  echo "repro_check: the copy did not build" >&2
  exit 1
}

if ! diff -r dist "$copy/dist" >"$tmp/diff.txt"; then
  head -n 40 "$tmp/diff.txt" >&2
  echo "repro_check: the copy at another path built a different site ($(grep -c '' "$tmp/diff.txt") line(s) of differences)" >&2
  exit 1
fi
echo "repro_check: OK ($(find dist -type f | wc -l | tr -d ' ') files identical, built from HEAD's files at another path)"
