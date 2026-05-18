import re

from app.dto.results import RagflowSessionMessageResult, ReferenceResult


CLEANED_CITATION_PATTERN = re.compile(r"\[\^(?P<number>\d+)\]")


def apply_session_reference_sets(
    messages: list[RagflowSessionMessageResult],
    assistant_answer_indices: list[int],
    reference_sets: list[list[ReferenceResult]],
) -> None:
    if not assistant_answer_indices:
        return

    if len(assistant_answer_indices) == 1:
        message_index = assistant_answer_indices[0]
        if messages[message_index].references:
            return
        citations = extract_cited_reference_numbers(messages[message_index].content)
        matching_references = find_covering_reference_set(reference_sets, citations)
        if matching_references:
            messages[message_index].references = matching_references
            return

        messages[message_index].references = flatten_reference_sets(reference_sets)
        return

    if len(reference_sets) <= len(assistant_answer_indices):
        target_indices = assistant_answer_indices[-len(reference_sets):]
        reference_set_start_index = 0
        aligned_reference_sets = reference_sets
    else:
        target_indices = assistant_answer_indices
        reference_set_start_index = len(reference_sets) - len(assistant_answer_indices)
        aligned_reference_sets = reference_sets[-len(assistant_answer_indices):]

    for offset, (message_index, reference_set) in enumerate(
        zip(target_indices, aligned_reference_sets)
    ):
        if messages[message_index].references:
            continue

        citations = extract_cited_reference_numbers(messages[message_index].content)
        if citations:
            matching_references = find_covering_reference_set(
                reference_sets,
                citations,
                before_index=reference_set_start_index + offset + 1,
            )
            if matching_references:
                messages[message_index].references = matching_references
                continue

        if reference_set:
            messages[message_index].references = reference_set


def flatten_reference_sets(
    reference_sets: list[list[ReferenceResult]],
) -> list[ReferenceResult]:
    references: list[ReferenceResult] = []
    for reference_set in reference_sets:
        references.extend(reference_set)
    return references


def find_covering_reference_set(
    reference_sets: list[list[ReferenceResult]],
    citations: set[int],
    before_index: int | None = None,
) -> list[ReferenceResult]:
    if not citations:
        return []

    candidate_sets = (
        reference_sets[:before_index]
        if before_index is not None
        else reference_sets
    )
    best_reference_set: list[ReferenceResult] = []
    best_score: tuple[int, int] | None = None
    for index, reference_set in enumerate(candidate_sets):
        reference_numbers = reference_number_set(reference_set)
        if not citations.issubset(reference_numbers):
            continue

        score = (
            len(reference_numbers - citations),
            -index,
        )
        if best_score is None or score < best_score:
            best_score = score
            best_reference_set = reference_set
    return best_reference_set


def reference_number_set(references: list[ReferenceResult]) -> set[int]:
    return {
        reference.reference_number
        for reference in references
        if reference.reference_number is not None
    }


def extract_cited_reference_numbers(content: str) -> set[int]:
    cited_numbers: set[int] = set()
    for match in CLEANED_CITATION_PATTERN.finditer(content):
        cited_numbers.add(int(match.group("number")))
    return cited_numbers
