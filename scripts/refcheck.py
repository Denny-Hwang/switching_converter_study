#!/usr/bin/env python3
"""refcheck -- STUB (Phase 0).

Will enforce: Every cite key used on a published page exists in references.bib and is not flagged VERIFY.
Implemented in Phase 1 (see docs/BUILD_SPEC.md section 7); until then it
only reports that it is a stub and exits 0 so CI can be wired up.
"""

import sys


def main() -> int:
    print("refcheck: stub (Phase 0) -- no checks enforced yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
