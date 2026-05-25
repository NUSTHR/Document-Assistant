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
from test_ragflow_session_creation import (
    test_chat_with_existing_session_does_not_create_new_session,
    test_chat_without_session_does_not_reuse_same_named_session,
    test_chat_without_session_names_session_from_first_question,
    test_chat_without_session_truncates_first_question_to_100_characters,
)


def main() -> None:
    test_empty_latest_reference_group_falls_back_to_covering_previous_group()
    test_misaligned_reference_group_prefers_tightest_covering_set()
    test_existing_message_level_references_are_preserved()
    test_chat_without_session_names_session_from_first_question()
    test_chat_without_session_truncates_first_question_to_100_characters()
    test_chat_without_session_does_not_reuse_same_named_session()
    test_chat_with_existing_session_does_not_create_new_session()
    print("reference alignment tests passed")


if __name__ == "__main__":
    main()
