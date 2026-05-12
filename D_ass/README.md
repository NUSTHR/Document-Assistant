# D_ass Frontend

这是当前项目的前端联调控制台，职责只有一个：调用 `ragflow_integration_service`，验证防腐层接口是否正常工作。

## 功能范围

- 健康检查：调用 `GET /health`
- 文件上传：调用 `POST /api/files`
- 流式对话：调用 `POST /api/chat`
- 引用展示：展示防腐层返回的 `biz_file_id`、`biz_file_name`、`chunk_content`、`similarity_score`

## 环境变量

先复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

默认配置如下：

```env
VITE_RAGFLOW_INTEGRATION_BASE_URL=http://localhost:8081
VITE_RAGFLOW_REQUEST_TIMEOUT_MS=10000
VITE_RAGFLOW_STREAM_CONNECT_TIMEOUT_MS=15000
```

字段说明：

- `VITE_RAGFLOW_INTEGRATION_BASE_URL`：后端防腐层服务地址
- `VITE_RAGFLOW_REQUEST_TIMEOUT_MS`：普通 HTTP 请求超时
- `VITE_RAGFLOW_STREAM_CONNECT_TIMEOUT_MS`：流式接口建立连接超时

## 启动方式

安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

构建检查：

```powershell
npm run build
```

## 页面输入说明

上传区域需要填写：

- `knowledge_base_name`
- `biz_file_id`
- `biz_file_name`
- 文件本体

对话区域需要填写：

- `assistant_name`
- `question`
- `session_name`，可留空

## 联调前提

- `ragflow_integration_service` 必须已经启动
- 后端 `.env` 中必须填入真实 `RAGFLOW_BASE_URL` 与 `RAGFLOW_API_KEY`
- 如果后端仍使用占位配置，前端只能验证页面与请求链路，不能验证真实 RAGFlow 业务结果
