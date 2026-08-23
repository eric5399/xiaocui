# 真实数据安全基线

## 已实现的事实

- `20260822000000_security_baseline.sql` 增加 `organizations`、`organization_members` 与 `task_participants`，所有核心业务表均有不可为空的 `organization_id`。
- 身份语义分为：机构管理员（`organization_members.role=admin`）、机构用户（`member`）与任务参与者（`task_participants`，可不属于机构成员）。
- 核心表启用 RLS：管理员只能读写所属机构数据；参与者只能读取已分配任务及本人 profile、interview、message、个人案例和规则；匿名 `anon` 没有任何管理端读取策略。
- Supabase 模式的 Route Handler 使用来访者 JWT 创建 request-scoped client；管理 API 额外验证管理员角色和 `X-Organization-Id`。服务角色密钥只存在于 `server-only` 模块，不用于普通请求授权。
- 核心记录有 `organization_id`、`created_by`、`updated_by`、`created_at`、`updated_at`；访谈仍保留 `completed_at`。
- 参与者侧已有受控免登录：短时链接领取后静默创建匿名 Supabase 会话，并绑定到 `task_participants`；链接不可被另一匿名身份重复领取。
- 录音写入私有 `interview-audio` bucket，消息只保存内部 `storage://` 引用；用户确认转写前不创建正式访谈消息。

## 留存与删除策略（当前为制度基线，尚未自动执行）

| 数据 | 默认策略 | 删除方式 |
| --- | --- | --- |
| 录音文件 | 私有 Storage bucket；访谈完成后 30 天删除 | 定时 worker 删除对象及音频 URL |
| 访谈文本、动态资料、客户信息 | 365 天后按机构策略匿名化或删除 | 定时 worker 先清除可识别字段，再删除业务记录或保留匿名统计 |
| Reference 文件 | 依据机构档案制度；有 legal hold 时暂停删除 | 受权限控制的人工审批或合规 worker |

录音、文本和资料不得进入公共 bucket、日志、前端埋点或模型提示词调试输出。删除 worker、legal hold、客户字段识别/脱敏和数据主体请求流程尚未实现。

## 当前不可承载真实机构数据

**当前仍不可以承载真实机构数据。** 数据库 RLS、API 授权基线、受控参与链接和私有 Storage 已添加，但没有管理员登录 UI、账号开通/停用界面、自动留存删除 worker、审计事件平台或真实生产环境验证。切换到 `EXPERIENCE_DATA_PROVIDER=supabase` 后，未携带有效 Supabase Auth JWT 的 API 请求会被拒绝；这是有意的安全失败，不是可用的生产管理员登录方案。

真实上线前必须在隔离测试项目中验证跨机构拒绝、参与者越权拒绝、撤销成员权限、删除任务、备份恢复和留存 worker，再经机构安全/法务审批。

试用期推荐的受控免登录、最简管理员认证及留存期限见 [`PILOT_ACCESS_AND_RETENTION_POLICY.md`](./PILOT_ACCESS_AND_RETENTION_POLICY.md)。

仓库中的 `tests/supabase-rls.integration.test.ts` 提供跨机构拒绝的真实 RLS 验证：在隔离测试项目设置 `SUPABASE_TEST_ORG_A_ACCESS_TOKEN` 与属于机构 B 的 `SUPABASE_TEST_ORG_B_SCENARIO_ID` 后执行 `npm run test`。未设置测试凭据时该测试会跳过，不能视为已完成真实环境验证。
