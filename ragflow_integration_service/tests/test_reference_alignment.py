from app.adapters.ragflow.reference_alignment import apply_session_reference_sets
from app.dto.results import RagflowSessionMessageResult, ReferenceResult


def make_reference(number: int) -> ReferenceResult:
    return ReferenceResult(
        biz_file_id=f"file-{number}",
        biz_file_name=f"file-{number}.pdf",
        chunk_content=f"chunk {number}",
        reference_number=number,
        similarity_score=0.9,
    )


def make_messages(*assistant_answers: str) -> list[RagflowSessionMessageResult]:
    messages = [
        RagflowSessionMessageResult(role="assistant", content="Hi", references=[]),
    ]
    for index, answer in enumerate(assistant_answers):
        messages.append(
            RagflowSessionMessageResult(
                role="user",
                content=f"question {index}",
                references=[],
            )
        )
        messages.append(
            RagflowSessionMessageResult(
                role="assistant",
                content=answer,
                references=[],
            )
        )
    return messages


def assistant_indices(messages: list[RagflowSessionMessageResult]) -> list[int]:
    has_seen_user = False
    indices: list[int] = []
    for index, message in enumerate(messages):
        if message.role == "assistant" and has_seen_user:
            indices.append(index)
        if message.role == "user":
            has_seen_user = True
    return indices


def test_empty_latest_reference_group_falls_back_to_covering_previous_group() -> None:
    messages = make_messages("Answer one [^0] [^2]", "Answer two [^1]")
    apply_session_reference_sets(
        messages,
        assistant_indices(messages),
        [
            [make_reference(0), make_reference(1), make_reference(2)],
            [],
        ],
    )

    assert [reference.reference_number for reference in messages[2].references] == [0, 1, 2]
    assert [reference.reference_number for reference in messages[4].references] == [0, 1, 2]


def test_misaligned_reference_group_prefers_tightest_covering_set() -> None:
    messages = make_messages("Answer one [^0] [^1]", "Answer two [^2]")
    apply_session_reference_sets(
        messages,
        assistant_indices(messages),
        [
            [make_reference(0), make_reference(1)],
            [make_reference(0), make_reference(1), make_reference(2)],
            [],
        ],
    )

    assert [reference.reference_number for reference in messages[2].references] == [0, 1]
    assert [reference.reference_number for reference in messages[4].references] == [0, 1, 2]


def test_existing_message_level_references_are_preserved() -> None:
    messages = make_messages("Answer one [^0]")
    messages[2].references = [make_reference(0)]
    apply_session_reference_sets(
        messages,
        assistant_indices(messages),
        [[make_reference(0), make_reference(1)]],
    )

    assert [reference.reference_number for reference in messages[2].references] == [0]
