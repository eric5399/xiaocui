import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";

export async function claimParticipantAccess(request: Request, token: string) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "AUTH_REQUIRED", "请重新打开参与链接以建立安全会话");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if(!url||!key) throw new ApiError(503,"SUPABASE_AUTH_UNCONFIGURED","当前环境未配置 Supabase 参与者会话");
  const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:authorization}}});
  const {data,error}=await client.rpc("claim_participant_access_link",{raw_token:token}).single();
  if(error) throw new ApiError(403,"ACCESS_LINK_INVALID","参与链接无效、已过期或已在其他设备使用");
  return data;
}
