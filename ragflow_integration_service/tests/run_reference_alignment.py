from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from test_reference_alignment import (
    test_empty_latest_reference_group_falls_back_to_covering_previous_group,
    test_existing_message_level_references_are_preserved,
    test_misaligned_reference_group_prefers_tightest_covering_set,
)


def main() -> None:
    test_empty_latest_reference_group_falls_back_to_covering_previous_group()
    test_misaligned_reference_group_prefers_tightest_covering_set()
    test_existing_message_level_references_are_preserved()
    print("reference alignment tests passed")


if __name__ == "__main__":
    main()
