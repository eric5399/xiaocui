# 最简管理员账号开通（内部试用）

本方案只创建预置管理员，不接入邮箱、企业微信、SSO、自助注册或自助找回密码。参与者的受控免登录流程不受影响。

## 已确定的绑定

| 项目 | 值 |
| --- | --- |
| 管理端显示账号 | `admin03` |
| Supabase Auth 内部登录标识 | `admin03@admin.local` |
| 所属机构 | `演示机构` |
| 机构 ID | `00000000-0000-4000-8000-000000000001` |
| 权限 | `admin` |

`admin03@admin.local` 只是 Supabase Auth 必需的内部标识；系统界面只显示 `admin03`，不会发送或依赖邮件。

## 一次性开通步骤

1. 打开 Supabase Dashboard，进入当前项目。
2. 选择 **Authentication → Users → Add user → Create new user**。
3. 填入 Email：`admin03@admin.local`。
4. 设置一条由机构保存的强密码（至少 16 位，建议由密码管理器生成）。不要把密码写入 `.env.local`、代码库或聊天记录。
5. 确认 **Auto Confirm User** 已开启，然后创建用户。
6. 在本项目的 `.env.local` 中确认以下三行存在（没有旧值时可直接添加；不要删除其他 LLM、ASR 或 Supabase 配置）：

```dotenv
ADMIN_LOGIN_USERNAME=admin03
ADMIN_LOGIN_EMAIL=admin03@admin.local
ADMIN_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001
```

7. 在项目目录运行：

```bash
npm run provision:admin
```

成功时只会输出账号、机构和 `provisioned` 状态，不输出密码、JWT 或 service role key。该命令会把已创建的 Auth 用户绑定为“演示机构”的 `admin`；重复运行是安全的。
8. 重启本地应用后访问 `/admin/login`，输入 `admin03` 和你刚设置的密码。

## 验收

- 不登录访问 `/admin` 会跳转 `/admin/login`（仅 Supabase 模式）。
- `admin03` 登录后可进入 `/admin`。
- 退出后再次访问管理端会被要求登录。
- 未绑定到 `organization_members` 的 Auth 用户，即使密码正确，也会被拒绝。
- 所有真实管理 API 继续在服务端用 JWT + `organization_members.role = admin` 校验；浏览器不会持有 service role key。

## 当前边界

管理端的部分页面仍是演示数据和本地草稿，尚未全面切换到真实管理 API。因此本登录功能保护管理入口及 API 权限，但不能单独证明整套管理 UI 的真实数据隔离已经完成。账号停用、密码重置流程、自动留存删除和生产监控仍是正式承载真实机构数据的阻断项。
