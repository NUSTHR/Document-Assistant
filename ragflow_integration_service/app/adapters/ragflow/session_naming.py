SESSION_NAME_MAX_LENGTH = 100
FALLBACK_SESSION_NAME = "Untitled"


def session_name_from_question(question: str) -> str:
    normalized_question = " ".join(question.strip().split())
    if not normalized_question:
        return FALLBACK_SESSION_NAME
    return normalized_question[:SESSION_NAME_MAX_LENGTH]
