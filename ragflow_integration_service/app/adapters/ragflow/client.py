import json
from collections.abc import Iterator
from functools import lru_cache
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.adapters.ragflow.exceptions import RagflowIntegrationError
from app.core.config import get_settings


class RagflowHttpClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: int) -> None:
        normalized_base_url = base_url.rstrip("/")
        if normalized_base_url.endswith("/api/v1"):
            normalized_base_url = normalized_base_url[: -len("/api/v1")]
        self._base_url = normalized_base_url
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("GET", path, params=params)

    def post(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("POST", path, json_body=json_body)

    def put(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("PUT", path, json_body=json_body)

    def patch(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("PATCH", path, json_body=json_body)

    def delete(
        self,
        path: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request_json("DELETE", path, json_body=json_body)

    def upload(
        self,
        path: str,
        files: list[tuple[str, str, bytes]],
    ) -> dict[str, Any]:
        boundary = "----DocumentationAssistantBoundary"
        body_parts: list[bytes] = []
        for field_name, file_name, content in files:
            body_parts.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    (
                        f'Content-Disposition: form-data; name="{field_name}"; '
                        f'filename="{file_name}"\r\n'
                    ).encode("utf-8"),
                    b"Content-Type: application/octet-stream\r\n\r\n",
                    content,
                    b"\r\n",
                ]
            )
        body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        return self._request_json(
            "POST",
            path,
            body=b"".join(body_parts),
            content_type=f"multipart/form-data; boundary={boundary}",
        )

    def download(self, path: str) -> bytes:
        request = self._build_request("GET", path)
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                return response.read()
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise RagflowIntegrationError(
                f"ragflow download failed with status {exc.code}: {message}"
            ) from exc
        except URLError as exc:
            raise RagflowIntegrationError(f"ragflow request failed: {exc}") from exc

    def stream_post(
        self,
        path: str,
        json_body: dict[str, Any],
    ) -> Iterator[dict[str, Any]]:
        body = json.dumps(json_body).encode("utf-8")
        request = self._build_request(
            "POST",
            path,
            body=body,
            content_type="application/json",
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    if line.startswith("data:"):
                        line = line[len("data:") :].strip()
                    if not line or line == "[DONE]":
                        continue
                    payload = json.loads(line)
                    if isinstance(payload, dict):
                        yield payload
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise RagflowIntegrationError(
                f"ragflow stream failed with status {exc.code}: {message}"
            ) from exc
        except (URLError, json.JSONDecodeError) as exc:
            raise RagflowIntegrationError(f"ragflow stream failed: {exc}") from exc

    def _request_json(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        body: bytes | None = None,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        request_body = body
        request_content_type = content_type
        if json_body is not None:
            request_body = json.dumps(json_body).encode("utf-8")
            request_content_type = "application/json"

        request = self._build_request(
            method,
            path,
            params=params,
            body=request_body,
            content_type=request_content_type,
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                raw_body = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise RagflowIntegrationError(
                f"ragflow request failed with status {exc.code}: {message}"
            ) from exc
        except URLError as exc:
            raise RagflowIntegrationError(f"ragflow request failed: {exc}") from exc

        try:
            payload = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError as exc:
            raise RagflowIntegrationError("ragflow returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise RagflowIntegrationError("ragflow returned an unexpected response")
        code = payload.get("code")
        if code not in (0, None):
            raise RagflowIntegrationError(
                str(payload.get("message") or "ragflow request failed")
            )
        return payload

    def _build_request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        body: bytes | None = None,
        content_type: str | None = None,
    ) -> Request:
        url = f"{self._base_url}/api/v1/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urlencode(params, doseq=True)}"

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return Request(url=url, data=body, headers=headers, method=method)


@lru_cache(maxsize=1)
def get_ragflow_client() -> RagflowHttpClient:
    settings = get_settings()
    return RagflowHttpClient(
        base_url=settings.ragflow_base_url,
        api_key=settings.ragflow_api_key,
        timeout_seconds=settings.ragflow_timeout_seconds,
    )
