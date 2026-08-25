"use client";

import { FormEvent, type ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { H5Frame, InvalidInvite, LoadingPanel } from "./H5Frame";
import { emptyCoverage } from "./mock-data";
import { useH5Progress } from "./use-h5-progress";
import { mapApiStage, mergeApiCoverage, type ApiInformationState } from "./api-contract";
import type { ParticipantProfile } from "./types";
import styles from "./h5.module.css";
import { ensureAnonymousSession, participantHeaders } from "./auth-client";

type CustomField = { id: string; fieldName: string; fieldType: "text" | "number" | "select"; options: string[]; required: boolean; sortOrder: number };
type TaskLookupPayload = { data?: { id: string; scenario: { name: string; objective: string; customFields: CustomField[] } }; error?: { message?: string } };
type StartInterviewPayload = { data?: { interview: { id: string }; challengeCase: { title: string; description: string }; assistantMessage: { id: string; content: string; createdAt: string }; agent: { currentStage: string; informationState: ApiInformationState } }; error?: { message?: string } };
type ProfileErrors = Record<string, string | undefined>;

const legacyProfileKeys: Record<string, keyof ParticipantProfile> = { 姓名: "name", 机构: "organization", 岗位: "role", 从业年限: "years", 网点数量: "networkCount" };

function profileValue(profile: ParticipantProfile, fieldName: string) {
  return profile[fieldName] ?? profile[legacyProfileKeys[fieldName]] ?? "";
}

function updateProfileValue(profile: ParticipantProfile, fieldName: string, value: string): ParticipantProfile {
  const legacyKey = legacyProfileKeys[fieldName];
  return { ...profile, [fieldName]: value, ...(legacyKey ? { [legacyKey]: value } : {}) };
}

function profilePayload(profile: ParticipantProfile, fields: CustomField[]) {
  return Object.fromEntries(fields.map((field) => [field.fieldName, profileValue(profile, field.fieldName).trim()]).filter(([, value]) => value.length > 0));
}

export function ProfileForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);
  const [task, setTask] = useState<TaskLookupPayload["data"]>();
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      try {
        await ensureAnonymousSession();
        const response = await fetch(`/api/tasks/by-invite/${encodeURIComponent(inviteCode)}`, { cache: "no-store", headers: await participantHeaders() });
        const payload = (await response.json()) as TaskLookupPayload;
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "未找到对应任务");
        if (active) setTask(payload.data);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "无法进入任务");
      }
    })();
    return () => { active = false; };
  }, [inviteCode, ready]);

  useEffect(() => {
    if (!ready || !progress.apiInterviewId) return;
    router.replace(`/t/${inviteCode}/interview`);
  }, [inviteCode, progress.apiInterviewId, ready, router]);

  if (!ready) return <H5Frame quietHeader><LoadingPanel /></H5Frame>;
  if (loadError) return <InvalidInvite inviteCode={inviteCode} />;
  if (!task) return <H5Frame quietHeader><LoadingPanel label="正在准备任务" /></H5Frame>;
  return <ProfileFormFields inviteCode={inviteCode} task={task} initialProfile={progress.profile} privacyAccepted={progress.privacyAccepted} existingInterviewId={progress.apiInterviewId} updateProgress={updateProgress} />;
}

function ProfileFormFields({ inviteCode, task, initialProfile, privacyAccepted, existingInterviewId, updateProgress }: { inviteCode: string; task: NonNullable<TaskLookupPayload["data"]>; initialProfile: ParticipantProfile; privacyAccepted: boolean; existingInterviewId: string | null; updateProgress: ReturnType<typeof useH5Progress>["updateProgress"] }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [showSupplementary, setShowSupplementary] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "failed">("idle");
  const [syncError, setSyncError] = useState("");
  const [privacyError, setPrivacyError] = useState("");
  const submitLockRef = useRef(false);
  const fields = [...task.scenario.customFields].sort((left, right) => left.sortOrder - right.sortOrder);
  const requiredFields = fields.filter((field) => field.required);
  const supplementaryFields = fields.filter((field) => !field.required);

  function updateField(fieldName: string, value: string) {
    setProfile((current) => updateProfileValue(current, fieldName, value));
    if (errors[fieldName]) setErrors((current) => ({ ...current, [fieldName]: undefined }));
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    const nextErrors: ProfileErrors = {};
    for (const field of requiredFields) if (!profileValue(profile, field.fieldName).trim()) nextErrors[field.fieldName] = `请填写${field.fieldName}`;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      document.getElementById(fields.find((field) => nextErrors[field.fieldName])?.id ?? "")?.focus();
      return;
    }
    if (!privacyAccepted) {
      setPrivacyError("请先阅读并同意访谈资料处理说明");
      return;
    }
    if (existingInterviewId) {
      updateProgress({ profile, status: "interview" });
      router.push(`/t/${inviteCode}/interview`);
      return;
    }
    submitLockRef.current = true;
    setSyncState("syncing");
    setSyncError("");
    updateProgress({ profile, apiSyncState: "syncing", apiError: null });
    try {
      const startResponse = await fetch("/api/interviews/start", { method: "POST", headers: await participantHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ taskId: task.id, profile: profilePayload(profile, fields), privacyConsent: true, privacyConsentVersion: "pilot-v1" }) });
      const startPayload = (await startResponse.json()) as StartInterviewPayload;
      if (!startResponse.ok || !startPayload.data?.interview.id || !startPayload.data.assistantMessage) throw new Error(startPayload.error?.message || "访谈创建失败");
      const started = startPayload.data;
      updateProgress({ profile, status: "interview", messages: [{ id: started.assistantMessage.id, role: "agent", target: mapApiStage(started.agent.currentStage), content: started.assistantMessage.content, createdAt: started.assistantMessage.createdAt }], coverage: mergeApiCoverage({ ...emptyCoverage }, started.agent.informationState), draft: "", completedAt: null, apiInterviewId: started.interview.id, apiChallenge: { title: started.challengeCase.title, description: started.challengeCase.description }, apiExtractedCase: null, caseReviewStatus: "ai_generated", caseReviewConfirmed: false, apiSyncState: "synced", apiError: null });
      router.push(`/t/${inviteCode}/interview`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "服务端暂时不可用";
      setSyncState("failed");
      setSyncError(message);
      updateProgress({ apiSyncState: "failed", apiError: message });
      submitLockRef.current = false;
    }
  }

  function renderField(field: CustomField) {
    const value = profileValue(profile, field.fieldName);
    const error = errors[field.fieldName];
    const common = { id: field.id, name: field.fieldName, value, disabled: syncState === "syncing", "aria-invalid": Boolean(error), "aria-describedby": error ? `${field.id}-error` : undefined, onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateField(field.fieldName, event.target.value) };
    return <div className={styles.fieldGroup} key={field.id}>
      <label htmlFor={field.id}>{field.fieldName}{field.required && <span>必填</span>}</label>
      {field.fieldType === "select" ? <select {...common}><option value="">请选择</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input {...common} type={field.fieldType === "number" ? "number" : "text"} inputMode={field.fieldType === "number" ? "numeric" : undefined} autoComplete={field.fieldName === "姓名" ? "name" : undefined} />}
      {error && <p id={`${field.id}-error`} className={styles.fieldError} role="alert">{error}</p>}
    </div>;
  }

  return <H5Frame quietHeader><section className={styles.formPage}>
    <div className={styles.pageHeading}><h1>{task.scenario.name}</h1><p>{task.scenario.objective}</p></div>
    <form className={styles.profileForm} onSubmit={submitProfile} aria-busy={syncState === "syncing"} noValidate>
      {requiredFields.map(renderField)}
      {supplementaryFields.length > 0 && <div className={styles.supplementaryFields}><button className={styles.supplementaryToggle} type="button" onClick={() => setShowSupplementary((current) => !current)} aria-expanded={showSupplementary}>补充信息 <span aria-hidden="true">{showSupplementary ? "−" : "+"}</span></button>{showSupplementary && <div className={styles.supplementaryList}>{supplementaryFields.map(renderField)}</div>}</div>}
      <label className={styles.consentRow}><input type="checkbox" checked={privacyAccepted} onChange={(event) => { updateProgress({ privacyAccepted: event.target.checked }); setPrivacyError(""); }} disabled={syncState === "syncing"} /><span>我已阅读并同意：访谈资料用于经验萃取；录音仅在我主动使用语音回答时采集和转写，可改用文字回答。</span></label>
      {privacyError && <p className={styles.fieldError} role="alert">{privacyError}</p>}
      {syncState === "failed" && <p className={styles.fieldError} role="alert">{syncError}，请重试。</p>}
      <button className={styles.primaryButton} type="submit" disabled={syncState === "syncing"}>{syncState === "syncing" ? "正在进入对话…" : syncState === "failed" ? "重试进入对话" : "开始聊聊"}</button>
    </form>
  </section></H5Frame>;
}
