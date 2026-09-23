#!/usr/bin/env python3
"""mathlint -- STUB (Phase 0).

Will enforce: No hand-typed $$ math blocks in MDX, every <Eq id> exists, no inline equations typed by hand.
Implemented in Phase 1 (see docs/BUILD_SPEC.md section 7); until then it
only reports that it is a stub and exits 0 so CI can be wired up.
"""

import sys


def main() -> int:
    print("mathlint: stub (Phase 0) -- no checks enforced yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
