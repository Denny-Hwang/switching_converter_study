# Privacy and data rules

This is a public repository. The following may never appear in any committed file:

1. Measured data, tables, waveforms, or parameter sets taken from any real
   project, lab, deployment, or product — including "anonymized" versions
   that preserve the actual numbers.
2. Names of institutions, programs, sites, vessels/platforms, devices, or
   revisions of any real design.
3. Sizing choices copied from a real design (e.g., a specific shunt/gain pair
   chosen for a specific measured current). Generic sizing examples are fine
   when the numbers come from a cited textbook example or
   examples/synthetic/*.yaml.
4. Any personal information.

Allowed sources of numbers: (a) cited textbook examples (cite chapter/example),
(b) examples/synthetic/*.yaml (round numbers, labeled "synthetic" in the page),
(c) vendor datasheet values for generic parts, with citation, used only to
illustrate a general point.

Enforcement: scripts/privacy_scan.py checks categories (units-with-numbers in
prose must be traceable to a cited example or a synthetic file) and, if the
gitignored .private/denylist.txt exists locally, fails on any listed token.
Maintainers keep their own denylist locally; it is never committed.
