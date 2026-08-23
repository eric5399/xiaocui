# 小萃 · 机构经验萃取 Agent MVP

面向保险机构的经验资产生产平台。总部产品经理配置业务场景，一线业务人员完成“案例挑战 + 深度复盘”，系统将个人隐性经验沉淀为可追溯的萃取案例、经验规则和 Markdown Reference。

本仓库支持 Mock 与可配置的真实 Provider。LLM 与语音转写结果均是待审核草稿，不会被标记为正式业务规则。

## 快速开始

要求：Node.js 20.9 或更高版本。推荐使用锁文件安装依赖：

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

- 管理工作台：`http://localhost:3000/admin`
- 业务员入口：`http://localhost:3000/join`
- 默认邀请码：`XC2026`
- 直接进入任务：`http://localhost:3000/t/XC2026`

默认演示数据保存在浏览器本地存储或进程内 Mock Repository 中；刷新页面可恢复 H5 访谈草稿，重启开发进程会重置后端 Mock 数据。设置 `EXPERIENCE_DATA_PROVIDER=supabase` 并提供 Supabase 配置后，Route Handler 会改用 Supabase PostgreSQL Repository。Supabase 模式不会继承 Mock 的匿名演示权限：必须提供有效 Supabase Auth JWT，管理接口还必须是所属机构管理员。

## 当前演示路径

下列闭环使用预置合成任务 `XC2026`：

```text
查看预置任务与邀请码 / 二维码
    → 业务员填写动态资料
    → 查看模拟挑战案例
    → Mock Agent 根据五维信息缺口追问
    → 录音转写（Mock 或已配置的讯飞）或文字回答
    → 提交并生成个人萃取案例 / 规则
    → 后台查看预置的多人访谈视图
    → 选择访谈并生成机构经验草稿
    → 预览 / 下载 Markdown Reference
```

当前 UI 还不是共享同一实时状态的端到端系统：

- H5 使用预置邀请码 `XC2026`，并与进程内 Mock API 打通资料、访谈和提交流程。H5 路由仍只允许 `XC2026`。
- 管理端“新建任务”保存到浏览器 `localStorage`，不会写入 Mock API，也不会生成新的 H5 邀请任务。
- 管理端访谈、融合与 Reference 页展示预置演示数据，不会自动反映刚在 H5 提交的访谈。Route Handlers 与服务层另外提供了可测试的访谈、融合和 Reference API 链路。

五维信息状态包括：机会发现、判断逻辑、动作选择、效果反馈、边界条件。Mock Interview Agent 依据当前状态选择下一追问维度，不是前端写死的一页固定问卷。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4 + 全局设计 token
- Next.js Route Handlers
- PostgreSQL / Supabase migration 与合成 seed（当前仅作为 schema 资产）
- Zod API 输入校验
- 可替换 LLM Gateway、Speech Adapter 与三个 Agent
- Vitest 纯函数和状态机测试

## 目录

```text
app/
├── admin/                 # PC 管理端
├── join/                  # H5 邀请码入口
├── t/[inviteCode]/        # H5 任务 / 案例 / 访谈流程
└── api/                   # Mock-first Route Handlers
components/
├── admin/
├── h5/
└── shared/
lib/
├── agents/                # 案例、访谈、融合 Agent
├── llm/                   # LLM Gateway 与 Provider contract
├── speech/                # Speech Adapter 与 Provider contract
├── reference/             # Markdown 生成
└── repository/            # Repository contract、Mock 与 Supabase 实现
prompts/                   # 独立 Prompt 文件
supabase/
├── migrations/            # PostgreSQL schema / RLS / indexes
└── seed.sql               # 可复现合成数据
database/                  # 数据字典与架构说明
docs/                      # 产品决策与验收说明
tests/                     # Agent / Reference 测试
```

## 数据库

复制 [`.env.example`](.env.example) 为 `.env.local`。未设置 `EXPERIENCE_DATA_PROVIDER` 时固定使用 Mock 模式，不需要数据库凭证，也不会连接 Supabase。

### 零配置演示

```bash
EXPERIENCE_DATA_PROVIDER=mock
```

页面既有的“Mock 模式 / 演示环境”标识会保持显示；此模式不产生数据库持久化。

### 本地 Supabase

将 `.env.example` 复制为 `.env.local`，然后在服务端填写：

```bash
EXPERIENCE_DATA_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` 仅由 server-only 维护代码读取；绝不能使用 `NEXT_PUBLIC_` 前缀、提交到仓库或写入测试。普通 API 请求使用 anon key + 来访者 JWT，避免 service role 绕过 RLS。管理员请求还需带 `Authorization: Bearer <access-token>` 和 `X-Organization-Id: <organization-id>`。

已安装 Supabase CLI 和 Docker-compatible runtime 时：

```bash
supabase start
supabase db reset
```

`supabase db reset` 会按顺序重放 `supabase/migrations/` 并加载 `supabase/seed.sql`。真实环境应只使用 migration 管理 schema，不要直接复制演示数据。

使用 `supabase db push` 可将 migration 推送到已关联的远程项目。设置 `EXPERIENCE_DATA_PROVIDER=supabase` 但遗漏 URL、anon key 或 service-role key 时，应用会明确报配置错误，不会静默回退或自动联网。

## Provider 边界

```text
Agent → LLM Gateway → Mock / 已配置的真实 Provider
Audio → Speech Adapter → Mock / 讯飞实时语音转写大模型
```

Mock Provider 默认可执行且不会联网。真实 Provider 仅在显式配置后调用，密钥只在服务端读取；页面、API Route 和业务逻辑均不得直接调用模型 SDK。

### LLM Gateway

`LLM_PROVIDER=mock` 是默认且零联网的模式。设为 `openai`、`deepseek` 或 `qwen` 后，三个 Agent 仍只调用 `lib/llm/llm-gateway.ts`；Gateway 再使用 OpenAI-compatible HTTP API。所有真实密钥只放在 `.env.local` 的 `LLM_API_KEY`，不得使用 `NEXT_PUBLIC_` 前缀。

```bash
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_KEY=你的服务端密钥
LLM_BASE_URL=https://api.deepseek.com
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=1
LLM_TEMPERATURE=0.2
```

模型成本按每轮记录的 `inputTokens`、`outputTokens` 计算：`inputTokens / 1,000,000 × 输入单价 + outputTokens / 1,000,000 × 输出单价`。单价必须从供应商当前价格页获取，不能硬编码为业务结论。案例、规则与融合结果均为 `pending_review` 草稿，必须人工审核后才能作为机构经验使用。

## API

文档要求的主接口均保留，并补足查询和状态接口。所有 Route Handler 只调用 Service，Service 再通过 `ExperienceRepository` 选择 Mock 或 Supabase；除 H5 的预置任务流程外，管理端尚未全面改为从这些接口读写：

- `GET|POST /api/scenarios`
- `GET|POST /api/tasks`
- `GET /api/tasks/by-invite/:inviteCode`
- `GET /api/admin/stats`
- `GET|POST /api/interviews`
- `POST /api/interviews/start`
- `POST /api/interviews/message`
- `GET /api/interviews/:id`
- `POST /api/interviews/:id/complete`
- `POST /api/cases/generate`
- `GET|POST /api/fusion/create`
- `GET /api/fusion/:id`
- `POST /api/speech/transcribe`
- `GET /api/reference/export?fusionJobId=...`

常规 JSON 成功响应统一为 `{ "data": ... }`，错误响应统一为 `{ "error": { "code", "message", "details?" } }`。`/api/reference/export` 默认直接返回 Markdown 附件；传入 `format=json` 时才返回 `{ "data": ... }`。

## 验证命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 生产化阻断项

**当前不可以承载真实机构数据。** 已有数据库租户/RLS、受控免登录参与链接、私有音频 Storage、最简管理员登录 UI 和 API 授权基线；但首个管理员账号尚待开通，且尚未有账号停用、自动留存删除 worker、审计事件平台和真实生产环境 RLS 验证。详见 [`docs/DATA_SECURITY_BASELINE.md`](docs/DATA_SECURITY_BASELINE.md)、[`docs/PILOT_ACCESS_AND_RETENTION_POLICY.md`](docs/PILOT_ACCESS_AND_RETENTION_POLICY.md) 与 [`docs/ADMINISTRATOR_ACCOUNT_SETUP.md`](docs/ADMINISTRATOR_ACCOUNT_SETUP.md)。上线前至少需要完成：

- 完成最简管理员账号开通/停用和机构成员分配，并在真实隔离环境中验证 RLS；
- 录音授权、隐私告知、PII 脱敏和自动留存/删除机制；
- 真实 LLM/ASR Provider 的重试、超时、成本、观测与内容安全；
- 独立生产 Supabase、正式 HTTPS 域名、可用性/错误/安全告警与备份恢复演练；详见 [`docs/PRODUCTION_PROJECT_AND_PILOT.md`](docs/PRODUCTION_PROJECT_AND_PILOT.md)；
- 专家审核、经验版本、证据强度和评测集；
- 用真实案例验证规则，禁止将演示阈值或候选经验直接用于业务决策。

产品范围和冲突处理见 [`docs/MVP_PRODUCT_DECISIONS.md`](docs/MVP_PRODUCT_DECISIONS.md)。
