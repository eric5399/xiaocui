import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
const username = process.env.ADMIN_LOGIN_USERNAME?.trim();
const organizationId = process.env.ADMIN_ORGANIZATION_ID?.trim();

if (!url || !serviceRoleKey || !email || !username || !organizationId) {
  throw new Error("缺少 Supabase 或 ADMIN_LOGIN_USERNAME / ADMIN_LOGIN_EMAIL / ADMIN_ORGANIZATION_ID 配置；未执行任何写入。");
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: users, error: userError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (userError) throw new Error(`无法读取 Auth 用户：${userError.message}`);
const user = users.users.find((item) => item.email?.toLowerCase() === email);
if (!user) {
  throw new Error(`未找到 ${email}。请先在 Supabase Dashboard → Authentication → Users 创建该账号；未执行任何写入。`);
}

const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name")
  .eq("id", organizationId)
  .maybeSingle();
if (organizationError || !organization) throw new Error("找不到 ADMIN_ORGANIZATION_ID 指向的机构；未执行任何写入。");

const { error: membershipError } = await supabase
  .from("organization_members")
  .upsert({ organization_id: organizationId, user_id: user.id, role: "admin" }, { onConflict: "organization_id,user_id" });
if (membershipError) throw new Error(`机构管理员绑定失败：${membershipError.message}`);

console.log(JSON.stringify({ username, organization: organization.name, role: "admin", status: "provisioned" }));
