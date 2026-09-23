#!/usr/bin/env python3
"""privacy_scan -- STUB (Phase 0).

Will enforce: Category rules from PRIVACY_RULES.md plus the optional, gitignored .private/denylist.txt.
Implemented in Phase 1 (see docs/BUILD_SPEC.md section 7); until then it
only reports that it is a stub and exits 0 so CI can be wired up.
"""

import sys


def main() -> int:
    print("privacy_scan: stub (Phase 0) -- no checks enforced yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
