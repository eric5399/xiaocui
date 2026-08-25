import "server-only";

import { createClient } from "@supabase/supabase-js";
import { MockExperienceStore } from "./mock-store";
import type { ExperienceRepository } from "./experience-repository";
import { SupabaseExperienceRepository } from "./supabase-repository";

export type ExperienceDataProvider = "mock" | "supabase";

export type DataProviderStatus = {
  provider: ExperienceDataProvider;
  isPersistent: boolean;
  configured: boolean;
  label: "Mock 模式" | "Supabase PostgreSQL";
};

function configuredProvider(): ExperienceDataProvider {
  const value = process.env.EXPERIENCE_DATA_PROVIDER?.trim().toLowerCase();
  if (!value || value === "mock") return "mock";
  if (value === "supabase") return "supabase";
  throw new Error("EXPERIENCE_DATA_PROVIDER 只能是 mock 或 supabase");
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url, anonKey, complete: Boolean(url && anonKey) };
}

export function getDataProviderStatus(): DataProviderStatus {
  const provider = configuredProvider();
  if (provider === "mock") {
    return { provider, isPersistent: false, configured: true, label: "Mock 模式" };
  }
  const config = supabaseConfig();
  return {
    provider,
    isPersistent: true,
    configured: config.complete,
    label: "Supabase PostgreSQL",
  };
}

function createRepository(): ExperienceRepository {
  const provider = configuredProvider();
  if (provider === "mock") return new MockExperienceStore();

  const { url, complete } = supabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!complete || !url || !serviceRoleKey) {
    throw new Error(
      "Supabase 模式未配置完整：请设置 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY；普通 API 还需要 NEXT_PUBLIC_SUPABASE_ANON_KEY；或将 EXPERIENCE_DATA_PROVIDER 设为 mock。",
    );
  }

  // This client is created only in a server-only module. The service role key
  // is never exported to browser bundles and auto-refresh is intentionally off.
  return new SupabaseExperienceRepository(
    createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
}

const globalRepository = globalThis as typeof globalThis & {
  __experienceAgentRepository?: ExperienceRepository;
};

export function getExperienceRepository(): ExperienceRepository {
  const repository = globalRepository.__experienceAgentRepository ?? createRepository();
  if (process.env.NODE_ENV !== "production") {
    globalRepository.__experienceAgentRepository = repository;
  }
  return repository;
}
