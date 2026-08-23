# 独立生产 Supabase、域名与小范围内部试用

> 当前状态：`Vercel 信息已确认；生产 Supabase 尚未隔离`。本文件区分已完成的代码基线与需要机构管理员在外部控制台执行的操作；未完成前，不得把开发 Supabase 项目或本机地址当成生产环境。

## 已存在事实

- 管理端核心页面已改为通过受 JWT 与 RLS 保护的管理 API 读取数据；不再使用 `components/admin/seed.ts` 或浏览器本地草稿作为业务数据源。
- `GET /api/health` 可用于部署平台存活检查，不返回密钥、项目 URL、机构 ID 或业务数据，也不会调用 LLM/ASR。
- `.env.production.example` 明确区分生产变量，所有 key 都保持服务端配置方式。
- 当前开发 Supabase 项目、真实 LLM/ASR 密钥与测试机构仍不得复用为生产资产。

## 已收到的部署信息

| 项目 | 当前值 | 状态 |
| --- | --- | --- |
| 部署平台 | Vercel | 已确认，尚未完成项目绑定/部署 |
| 目标域名 | `xiaocui.vercel.app` | 已存在；当前显示 No Production Deployment |
| Supabase URL | `https://rpcmdmbqgvkzxqfeavad.supabase.co` | 已收到，但与当前开发 `.env.local` 相同，不能视为独立生产项目 |
| 告警邮箱 | `eric_wu03@qq.com` | 已记录为内部试用告警接收人 |

## 仍未完成的外部前置条件

1. 独立 Supabase 生产项目与生产 Project Ref。
2. Vercel 项目绑定与 `xiaocui.vercel.app` 域名核验。
3. 监控服务账号、告警规则和响应值班人。
4. 生产 RLS 验证、备份恢复演练、自动留存删除 worker。

因此当前仍**不可承载真实机构数据**。

## 生产项目创建步骤（由你在 Supabase Dashboard 执行）

1. 新建一个独立 Supabase project，名称建议为 `experience-agent-prod`，区域选择数据驻留要求允许的区域。不要直接把 `rpcmdmbqgvkzxqfeavad` 作为生产项目，除非你明确接受开发/生产共库风险并完成数据清理与审批。
2. 不要复制开发项目数据库；在生产项目中从空库按顺序执行本仓库 `supabase/migrations/`。
3. 不加载开发 `seed.sql`。仅可在单独 staging 项目加载合成 seed。
4. 开启匿名登录仅用于受控免登录参与者；关闭公开 email 注册，不开放公开密码重置。
5. 创建私有 Storage bucket：`interview-audio`；应用现有 Storage/RLS migration。
6. 创建生产机构记录和最少一个管理员账号，再按 [管理员账号开通说明](ADMINISTRATOR_ACCOUNT_SETUP.md) 绑定成员关系。
7. 在 SQL Editor 或 CI 中执行 RLS 集成测试的等价用例：跨机构管理员、跨参与者访谈、跨用户音频均必须被拒绝。

## 域名与部署

代码仓库已加入 `vercel.json`，但 Vercel 项目和域名仍需在你的 Vercel 账号内完成绑定；代码不能代替账号授权或 DNS 操作。

1. 在 Vercel 导入本仓库对应的 Git 项目，Framework 选择 Next.js；构建配置会读取仓库的 `vercel.json`。
2. 先创建 Vercel Preview/Staging 环境，配置 `NEXT_PUBLIC_APP_URL=https://xiaocui.vercel.app`，但继续使用当前 Supabase 仅做合成数据验收。
3. 在生产部署项目导入 `.env.production.example` 所列变量，真实值只填在平台加密环境变量中。
4. 将正式域名的 DNS 记录按部署平台提示绑定；强制 HTTPS，禁止裸 IP 与 HTTP 回退。
5. 配置 Supabase Auth 的 Site URL 和 Redirect URL 为正式 HTTPS 域名及受控 staging 域名。不得加入通配符或 localhost 生产回调。
6. 发布前访问 `https://<域名>/api/health`，应返回 `status: ok` 与 `dataProvider: supabase`。

当前 Vercel 控制台已完成一项非敏感配置：`NEXT_PUBLIC_APP_URL=https://xiaocui.vercel.app`（Production + Preview）。由于项目尚无生产部署，变量要在首次部署后才会生效。

已收到部署平台、域名、当前 Supabase URL 和告警邮箱。下一步只需要你在 Vercel 控制台完成项目导入/授权，并在 Supabase 控制台新建独立生产项目；不要在聊天中发送任何密钥、密码或 service role key。

## 监控最小基线

建议采用三层，不以“已有控制台日志”替代告警：

| 层级 | 建议监控 | 告警阈值/责任 |
| --- | --- | --- |
| 可用性 | `https://xiaocui.vercel.app/api/health` 的 HTTP 状态、TLS 证书、域名可达性 | 5 分钟连续失败，通知 `eric_wu03@qq.com` |
| 应用 | 5xx 比率、登录失败率、API P95、ASR/LLM 失败率 | 15 分钟超过基线，通知 `eric_wu03@qq.com` |
| 数据与安全 | RLS 拒绝异常、Storage 403、删除 worker 失败、备份恢复失败 | 立即通知 `eric_wu03@qq.com` |

外部错误跟踪（如 Sentry）尚未接入，因为没有得到机构选型及 DSN。接入时必须：服务端 DSN 不得进入 `NEXT_PUBLIC_`；对 message、profile、transcript、audio URL 全部脱敏；禁止采集请求正文；只记录错误码、路由、耗时、provider/model 与匿名 trace id。

Vercel 当前为 Hobby 计划，项目 Alerts 页面提示需要 Pro，暂不启用付费升级。内部试用阶段应先用 UptimeRobot/Better Uptime 监控 `/api/health`，告警地址使用 `eric_wu03@qq.com`；这一步需你在对应监控服务控制台创建账号并确认告警订阅。

## 小范围内部试用门槛

满足以下全部条件后，才可开始**合成数据内部试用**：

- 独立 staging Supabase 与部署域名均可用；生产/开发凭证没有混用。
- 管理员、参与者、跨机构与跨参与者 RLS 回归全部通过。
- `/api/health` 和告警通道可用。
- 留存期限、删除审批人和 incident 联系人已确认。
- 只使用合成机构、合成参与者和非敏感语音；不得录入真实客户、保单、手机号或网点数据。

即使完成上述试用，也不等价于可承载真实机构数据。真实数据试用还需自动留存删除、备份恢复演练、监控告警闭环、正式隐私/授权文本及机构安全审批。
