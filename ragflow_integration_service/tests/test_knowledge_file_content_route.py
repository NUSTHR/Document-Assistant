from app.api.routes import knowledge_bases
from app.dto.results import KnowledgeFileContentResult


class FakeKnowledgeBaseService:
    def get_file_content(
        self,
        knowledge_base_name: str,
        biz_file_id: str,
    ) -> KnowledgeFileContentResult:
        return KnowledgeFileContentResult(
            knowledge_base_name=knowledge_base_name,
            biz_file_id=biz_file_id,
            biz_file_name=(
                "2026\u5e74\u6bcf\u6708\u56fa\u5b9a"
                "\u8d44\u4ea7\u7533\u8d2d\u8ba1\u5212.xlsx"
            ),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            content=b"file-bytes",
        )


def test_file_content_response_uses_ascii_safe_headers() -> None:
    response = knowledge_bases.get_file_content(
        knowledge_base_name="kb",
        biz_file_id="file-1",
        service=FakeKnowledgeBaseService(),  # type: ignore[arg-type]
    )

    assert response.body == b"file-bytes"
    assert "filename*=UTF-8''2026" in response.headers["content-disposition"]
    assert "x-file-name" not in response.headers
