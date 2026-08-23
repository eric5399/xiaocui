"use client";

import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;
const participantSubjectKey = "experience-agent:h5:participant-subject";

function persistParticipantSubject(subject: string | undefined) {
  if (typeof window === "undefined" || !subject) return;
  window.localStorage.setItem(participantSubjectKey, subject);
}

export function getParticipantStorageScope() {
  if (typeof window === "undefined") return "demo";
  return window.localStorage.getItem(participantSubjectKey) ?? "demo";
}
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
export async function participantHeaders(base: HeadersInit = {}) {
  const supabase = getClient();
  if (!supabase) return base;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) return base;
  persistParticipantSubject(data.session.user.id);
  return { ...base, Authorization: `Bearer ${data.session.access_token}` };
}
export function browserSupabase() { return getClient(); }
export async function ensureAnonymousSession() {
  const supabase=getClient();
  if(!supabase) return null;
  const existing=await supabase.auth.getSession();
  if(existing.data.session) {
    persistParticipantSubject(existing.data.session.user.id);
    return existing.data.session;
  }
  const created=await supabase.auth.signInAnonymously();
  if(created.error) throw new Error("当前项目尚未开启匿名参与者会话，请联系任务管理员。");
  persistParticipantSubject(created.data.session?.user.id);
  return created.data.session;
}
