# RAGFlow Integration Service

这是前端与 RAGFlow 之间的中间防腐层。

## 设计边界

- 只允许通过官方 `ragflow_sdk` 调 RAGFlow
- 不允许直接连接 RAGFlow 底层数据库
- 不允许把 RAGFlow 的 `dataset_id`、`document_id` 直接暴露给前端
- 前端只使用业务字段，例如 `biz_file_id`、`biz_file_name`

## 目录结构

- `app/api`：对前端暴露的 HTTP 接口
- `app/application`：用例编排层
- `app/ports`：依赖倒置接口
- `app/adapters/ragflow`：RAGFlow SDK 适配层
- `app/dto`：Pydantic 输入输出模型

## 当前核心接口

### `POST /api/files`

上传文件并触发解析。

表单字段：

- `knowledge_base_name`
- `biz_file_id`
- `biz_file_name`
- `file`

关键行为：

- 上传前会把文件名重写成 `[biz_id:FILE-xxxx]原始文件名.pdf`
- 这个埋点只存在于 Adapter 层
- 前端不需要感知 RAGFlow 物理 ID
- 当前实现通过 `ragflow_sdk` 的 `parse_documents(...)` 触发解析；该 SDK 方法内部会轮询直到文档进入终态后再返回，因此这里已经包含“等待解析完成”的同步等待机制

成功响应示例：

```json
{
  "biz_file_id": "FILE-10293",
  "biz_file_name": "2023年度报表.pdf",
  "parse_status": "DONE",
  "chunk_count": 12,
  "token_count": 980
}
```

### `POST /api/chat`

发起流式对话。

请求 JSON：

```json
{
  "assistant_name": "finance-assistant",
  "question": "请总结年度报表中的营收变化",
  "session_name": "demo-session"
}
```

返回：

- `text/event-stream`
- 每个 `data:` 块都符合统一结构

```json
{
  "answer": "流式文本片段... [^1]",
  "references": [
    {
      "biz_file_id": "FILE-10293",
      "biz_file_name": "2023年度报表.pdf",
      "chunk_content": "匹配到的切片文本...",
      "similarity_score": 0.92
    }
  ]
}
```

关键行为：

- 基于 `session.ask(..., stream=True)` 输出 SSE
- 在 Adapter 层把 `##0$$`、`[ID:0]` 这类内部引用标记清洗为 `[^1]`
- 在 Adapter 层从 `reference.document_name` 中反解 `biz_file_id` 与 `biz_file_name`
- 如果反解失败，只降级为 `UNKNOWN`，不会中断整段回答

## 环境变量

复制模板：

```powershell
Copy-Item .env.example .env
```

必须填写：

- `RAGFLOW_BASE_URL`
- `RAGFLOW_API_KEY`

注意：

- `RAGFLOW_BASE_URL` 必须是 RAGFlow 对外根地址
- `.env` 中不要手动追加 `/api/v1`
- 改完 `.env` 后必须重启服务

前端联调环境变量示例见 [`.env.example`](file:///c:/Users/96934/Desktop/Documentation%20Assistant/D_ass/.env.example)。

## 启动方式

### 1. 进入目录

```powershell
Set-Location "c:\Users\96934\Desktop\Documentation Assistant\ragflow_integration_service"
```

### 2. 启动服务

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8081
```

### 3. 健康检查

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health"
```

返回示例：

```json
{
  "status": "ok"
}
```

## 直接调用示例

### 上传文件

```powershell
$form = @{
  knowledge_base_name = "finance-kb-test"
  biz_file_id = "FILE-TEST-0001"
  biz_file_name = "test-report.txt"
  file = Get-Item ".\test-report.txt"
}

Invoke-RestMethod `
  -Uri "http://127.0.0.1:8081/api/files" `
  -Method Post `
  -Form $form
```

### 流式对话

```powershell
$body = @{
  assistant_name = "finance-assistant-test"
  question = "请总结 test-report.txt 的核心内容"
  session_name = "demo-session"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://127.0.0.1:8081/api/chat" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

说明：

- `Invoke-WebRequest` 会返回原始 SSE 文本
- 真实联调时需要重点检查 `data:` 块中的 `answer` 与 `references`

## Docker

```powershell
docker compose -f ..\docker-compose.ragflow-integration.yml up --build
```
