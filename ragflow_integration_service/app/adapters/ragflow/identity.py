import hashlib
import hmac

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.core.config import get_settings


def make_biz_id(kind: str, raw_id: str) -> str:
    normalized_id = raw_id.strip()
    if not normalized_id:
        return ""
    settings = get_settings()
    secret_value = settings.ragflow_identity_secret or settings.ragflow_api_key
    secret = secret_value.encode("utf-8")
    digest = hmac.new(
        secret,
        f"{kind}:{normalized_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:24]
    return f"{kind}_{digest}"


def resolve_raw_id(kind: str, biz_id: str, raw_ids: list[str]) -> str:
    for raw_id in raw_ids:
        if make_biz_id(kind, raw_id) == biz_id:
            return raw_id
    raise RagflowIntegrationError(f"{kind} resource was not found")
