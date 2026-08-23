"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAdministratorSession, signInAdministrator } from "./admin-auth-client";

function safeNext(value: string | null) {
  return value?.startsWith("/admin") && !value.startsWith("//") ? value : "/admin";
}

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin03");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const next = safeNext(searchParams.get("next"));

  useEffect(() => {
    getAdministratorSession().then(() => router.replace(next)).catch(() => undefined);
  }, [next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signInAdministrator(username, password);
      router.replace(next);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" onSubmit={submit} noValidate>
        <p className="admin-eyebrow">ADMIN ACCESS</p>
        <h1>管理员登录</h1>
        <p>仅限已分配到所属机构的管理员账号使用。</p>
        <label>
          管理员账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error ? <p className="admin-login-error" role="alert">{error}</p> : null}
        <button className="admin-button admin-button--primary" disabled={submitting} type="submit">
          {submitting ? "登录中…" : "进入管理端"}
          <span aria-hidden="true">→</span>
        </button>
        <small>不开放自助注册或找回密码；如需开通或重置，请联系系统管理员。</small>
      </form>
    </main>
  );
}
