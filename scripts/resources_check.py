#!/usr/bin/env python3
"""resources_check -- STUB (Phase 0).

Will enforce: Every resources.yaml entry has a URL that was opened and title-matched, with a retrieved date.
Implemented in Phase 4 (see docs/BUILD_SPEC.md section 7); until then it
only reports that it is a stub and exits 0 so CI can be wired up.
"""

import sys


def main() -> int:
    print("resources_check: stub (Phase 0) -- no checks enforced yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
