# Docker 部署

FYADR 提供单容器 Docker Compose 配置。Gunicorn 在同一端口提供 Flask API 和构建后的 React 前端，运行镜像不包含 Node.js、前端源码或开发服务器。

FYADR 提供可选的单用户登录保护，但不提供租户隔离或细粒度授权。默认不启用登录，端口仅绑定回环地址；需要共享访问时，应启用内置登录并在前置网关配置 HTTPS、来源限制和请求限流。

## 环境要求

- Docker Engine 或 Docker Desktop
- Docker Compose v2
- 可用的 OpenAI-compatible 模型服务

## 启动

```bash
git clone https://github.com/multi-zhangyang/fuck-your-ai-detection-rate.git
cd fuck-your-ai-detection-rate
docker compose up -d --build
```

打开 <http://127.0.0.1:8765>。健康检查地址为 <http://127.0.0.1:8765/api/ping>。

```bash
docker compose ps
docker compose logs -f fyadr
```

首次启动会创建 `data/` 下的持久化目录。容器入口先初始化挂载目录和运行状态，再以非 root 用户 `fyadr`（UID `10001`）启动 Gunicorn。

## 更新

```bash
git pull --ff-only
docker compose up -d --build
```

镜像更新和容器重建不会删除挂载在 `data/` 下的文档、历史、配置、提示词或导出文件。更新前仍建议备份整个 `data/` 目录。

### 旧版提示词目录迁移

早期 Compose 配置只将自定义提示词保存到 `data/prompts-custom/`。当前版本将内置提示词修改、流程模板、注册表和自定义提示词统一保存到 `data/prompts/`。

Compose 会以只读方式挂载旧目录。容器启动时只迁移第一层中名称合法、内容为 UTF-8 且不超过 `512 KiB` 的 Markdown 提示词；目录、符号链接、空文件和其他格式会被忽略。若旧提示词 ID 与内置提示词或现有内容冲突，迁移器会分配 `-legacy`、`-legacy-2` 等别名，两份内容都会保留。

迁移结果记录在 `data/prompts/.factory-state.json`。已迁移的提示词以后即使从界面删除，也不会被仍然挂载的旧目录重新创建。确认内容已出现在界面并完成备份后，可以归档旧目录中的文件；不要手动编辑 factory state。

## 持久化数据

| 主机目录 | 容器目录 | 内容 |
| --- | --- | --- |
| `data/origin/` | `/app/origin` | 上传的源文档 |
| `data/finish/` | `/app/finish` | 任务状态、历史数据库、备份和导出文件 |
| `data/config/` | `/app/config` | 模型服务配置和 API Key |
| `data/prompts/` | `/app/prompts` | 提示词、流程模板、注册表和自定义提示词 |
| `data/prompts-custom/` | `/app/legacy-prompts-custom` | 旧版自定义提示词的只读迁移来源 |

API Key 以可用明文保存在 `data/config/config.json`。应限制部署主机账户、磁盘备份和这些目录的访问权限，不要将 `data/` 提交到版本控制。

## 模型配置

在 Web 界面的“模型配置”中添加 Base URL、API Key 和模型。容器中的 Web 配置保存在 `/app/config/config.json`；`.env.example` 中的模型环境变量只用于直接运行 CLI 或脚本，不会自动写入 Web 配置。

修改已有服务商的 Base URL 后，必须重新输入 API Key。连接测试、模型目录读取和论文处理都会访问所配置的模型服务；使用前应确认服务商的数据保留、训练和计费政策。

## Web 登录保护

登录默认关闭。设置 `FYADR_AUTH_PASSWORD`、`FYADR_AUTH_PASSWORD_HASH` 或
`FYADR_AUTH_PASSWORD_FILE` 中的**一个**后，服务会在启动时启用单用户会话认证；用户名由
`FYADR_AUTH_USERNAME` 设置，默认为 `admin`。多个密码来源同时存在会使服务启动失败，避免部署时误用凭据。

推荐在未提交的 `.env` 文件或外部 secret 管理器中设置变量：

```dotenv
FYADR_AUTH_USERNAME=admin
FYADR_AUTH_PASSWORD=replace-with-a-long-random-password
FYADR_AUTH_COOKIE_SECURE=1
FYADR_AUTH_COOKIE_SAMESITE=Lax
```

上例可直接用于仓库已忽略的 `.env`；不要把该文件、明文密码、哈希或
`FYADR_AUTH_SECRET_KEY` 提交到仓库。也可以将 Werkzeug `generate_password_hash()` 生成的值放入
`FYADR_AUTH_PASSWORD_HASH`。如使用 `FYADR_AUTH_PASSWORD_FILE` 或 `FYADR_AUTH_SECRET_FILE`，对应
文件必须通过 Compose `secrets`、只读 volume 或平台 secret 注入明确挂载到容器中，并填写容器内路径；
文件必须是容器内可读的普通 UTF-8 文件，末尾换行会被忽略。

认证会话使用 HttpOnly、`SameSite=Lax` 的签名 Cookie。签名密钥在
`FYADR_APP_CONFIG_DIR/.auth-secret-key` 中以私有权限自动生成；如由 secret 管理器托管，可显式
设置 `FYADR_AUTH_SECRET_KEY` 或 `FYADR_AUTH_SECRET_FILE`。必须持久化 `/app/config`，否则容器重建
后所有会话都会失效。非 GET/HEAD/OPTIONS 的 API 请求还必须携带 `X-FYADR-CSRF`，前端会从
`GET /api/auth/status` 取得 CSRF token。

`GET /api/ping` 和 CORS `OPTIONS` 始终公开，用于健康检查和浏览器预检；其他 `/api` 路由在未登录
时返回 `401`。`FYADR_AUTH_COOKIE_SECURE=1` 只应在 HTTPS 终止后启用，并会附加 HSTS；跨站部署若
需要 `SameSite=None`，必须同时启用 Secure 和 HTTPS。

## 网络边界

Compose 默认使用：

```yaml
ports:
  - "127.0.0.1:8765:8765"
```

不要直接改为公网监听。CORS 只限制浏览器来源，TLS 只加密传输，两者都不能替代身份认证和授权。通过反向代理提供共享访问时，至少需要：

- 启用 FYADR 单用户登录，并在反向代理处再次限制管理网络；
- 限制允许访问的网络或来源；
- 设置上传大小、请求频率和连接时长限制；
- 阻止未受信任的客户端直接连接 FYADR 后端；
- 保护日志，避免记录文档内容、凭据和模型响应。

## 运行参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `8765` | 容器内 HTTP 端口 |
| `GUNICORN_WORKERS` | `1` | Gunicorn 进程数，当前必须保持为 `1` |
| `GUNICORN_THREADS` | `4` | 单进程请求线程数 |
| `FYADR_ALLOWED_ORIGINS` | 空 | 跨来源前端的 CORS 白名单，不是访问控制 |
| `FYADR_AUTH_USERNAME` | `admin` | 单用户登录名；只有配置密码来源时生效 |
| `FYADR_AUTH_PASSWORD` | 空 | 明文密码来源；与 HASH / FILE 只能三选一 |
| `FYADR_AUTH_PASSWORD_HASH` | 空 | Werkzeug `generate_password_hash()` 生成的密码哈希 |
| `FYADR_AUTH_PASSWORD_FILE` | 空 | 容器内普通 UTF-8 密码文件路径 |
| `FYADR_AUTH_SECRET_KEY` | 自动生成 | 会话签名密钥；留空时持久化到配置目录 |
| `FYADR_AUTH_SECRET_FILE` | 空 | 会话签名密钥文件；与 `...SECRET_KEY` 二选一 |
| `FYADR_AUTH_COOKIE_SECURE` | `0` | HTTPS 部署设为 `1`，同时启用 HSTS |
| `FYADR_AUTH_COOKIE_SAMESITE` | `Lax` | 会话 Cookie 的 SameSite 策略 |
| `FYADR_AUTH_SESSION_TTL_SECONDS` | `43200` | 登录会话有效期 |
| `FYADR_AUTH_RATE_LIMIT_MAX` / `...WINDOW_SECONDS` | `5` / `60` | 按来源地址统计的失败登录限流 |
| `FYADR_MAX_REQUEST_BYTES` | `67108864` | HTTP 请求体上限 |
| `FYADR_MAX_UPLOAD_BYTES` | `41943040` | 上传文件上限 |

运行、取消和 SSE 状态目前保存在单个服务进程中。将 `GUNICORN_WORKERS` 提高到 `1` 以上可能造成任务重复或状态不一致，入口脚本会拒绝这种配置。

Compose 默认限制容器使用 `1` 个 CPU、`2 GiB` 内存和 `256` 个进程，并将日志轮转为最多三个 `10 MiB` 文件。模型请求的正文分块并发由 Web 界面的 `Rewrite concurrency` 单独控制。

## 停止与备份

```bash
docker compose down
```

`docker compose down` 不会删除绑定到 `data/` 的文件。备份时应停止正在运行的改写或导出任务，然后复制整个 `data/` 目录；恢复时将备份放回原位置，再执行 `docker compose up -d --build`。

如需完全删除运行数据，请先单独确认备份，再手动处理 `data/`。Compose 命令本身不会替代数据保留策略。

## 排查

```bash
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 fyadr
curl --fail http://127.0.0.1:8765/api/ping
```

容器持续处于 `unhealthy` 时，先检查挂载目录权限、磁盘空间和 `data/config/config.json` 的内容。模型调用失败但健康检查正常时，应在“模型配置”中重新执行连接测试并检查服务商限流或超时设置。
