"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { H5Frame, LoadingPanel } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import { emptyCoverage } from "./mock-data";
import {
  mapApiStage,
  mergeApiCoverage,
  type ApiInformationState,
} from "./api-contract";
import type { ParticipantProfile } from "./types";
import styles from "./h5.module.css";
import { participantHeaders } from "./auth-client";

type ProfileErrors = Partial<Record<keyof ParticipantProfile, string>>;
type TaskLookupPayload = { data?: { id: string }; error?: { message?: string } };
type StartInterviewPayload = {
  data?: {
    interview: { id: string };
    challengeCase: { title: string; description: string };
    assistantMessage: { id: string; content: string; createdAt: string };
    agent: { currentStage: string; informationState: ApiInformationState };
  };
  error?: { message?: string };
};

function profilesMatch(left: ParticipantProfile, right: ParticipantProfile) {
  return (Object.keys(left) as Array<keyof ParticipantProfile>).every(
    (key) => left[key] === right[key],
  );
}

export function ProfileForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);

  useEffect(() => {
    if (!ready) return;
    if (!progress.privacyAccepted) {
      router.replace(`/t/${inviteCode}`);
    }
  }, [inviteCode, progress.privacyAccepted, ready, router]);

  if (!ready || !progress.privacyAccepted) {
    return (
      <H5Frame activeStep={1} backHref={`/t/${inviteCode}`}>
        <LoadingPanel />
      </H5Frame>
    );
  }

  return (
    <ProfileFormFields
      inviteCode={inviteCode}
      initialProfile={progress.profile}
      existingInterviewId={progress.apiInterviewId}
      updateProgress={updateProgress}
    />
  );
}

function ProfileFormFields({
  inviteCode,
  initialProfile,
  existingInterviewId,
  updateProgress,
}: {
  inviteCode: string;
  initialProfile: ParticipantProfile;
  existingInterviewId: string | null;
  updateProgress: ReturnType<typeof useH5Progress>["updateProgress"];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<ParticipantProfile>(initialProfile);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "failed">("idle");
  const [syncError, setSyncError] = useState("");
  const submitLockRef = useRef(false);

  function updateField(field: keyof ParticipantProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function continueLocally() {
    updateProgress({
      profile,
      status: "challenge",
      apiInterviewId: null,
      apiChallenge: null,
      apiExtractedCase: null,
      messages: [],
      coverage: { ...emptyCoverage },
      draft: "",
      completedAt: null,
      apiSyncState: "failed",
      apiError: syncError || "服务端暂时不可用",
    });
    router.push(`/t/${inviteCode}/challenge`);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    const nextErrors: ProfileErrors = {};

    if (!profile.name.trim()) nextErrors.name = "请填写姓名";
    if (!profile.organization.trim())
      nextErrors.organization = "请填写所属机构";
    if (!profile.years) nextErrors.years = "请选择从业年限";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalid = Object.keys(nextErrors)[0];
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    if (existingInterviewId && profilesMatch(profile, initialProfile)) {
      updateProgress({ status: "challenge" });
      router.push(`/t/${inviteCode}/challenge`);
      return;
    }

    submitLockRef.current = true;
    setSyncState("syncing");
    setSyncError("");
    updateProgress({ apiSyncState: "syncing", apiError: null });

    try {
      const taskResponse = await fetch(
        `/api/tasks/by-invite/${encodeURIComponent(inviteCode)}`,
        { cache: "no-store", headers: await participantHeaders() },
      );
      const taskPayload = (await taskResponse.json()) as TaskLookupPayload;
      if (!taskResponse.ok || !taskPayload.data?.id) {
        throw new Error(taskPayload.error?.message || "未找到对应的演示任务");
      }

      const startResponse = await fetch("/api/interviews/start", {
        method: "POST",
        headers: await participantHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          taskId: taskPayload.data.id,
          profile: {
            姓名: profile.name.trim(),
            机构: profile.organization.trim(),
            从业年限: profile.years,
          },
        }),
      });
      const startPayload = (await startResponse.json()) as StartInterviewPayload;
      if (
        !startResponse.ok ||
        !startPayload.data?.interview.id ||
        !startPayload.data.assistantMessage
      ) {
        throw new Error(startPayload.error?.message || "访谈创建失败");
      }

      const started = startPayload.data;
      updateProgress({
        profile,
        status: "challenge",
        messages: [
          {
            id: started.assistantMessage.id,
            role: "agent",
            target: mapApiStage(started.agent.currentStage),
            content: started.assistantMessage.content,
            createdAt: started.assistantMessage.createdAt,
          },
        ],
        coverage: mergeApiCoverage(
          { ...emptyCoverage },
          started.agent.informationState,
        ),
        draft: "",
        completedAt: null,
        apiInterviewId: started.interview.id,
        apiChallenge: {
          title: started.challengeCase.title,
          description: started.challengeCase.description,
        },
        apiExtractedCase: null,
        apiSyncState: "synced",
        apiError: null,
      });
      router.push(`/t/${inviteCode}/challenge`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "服务端暂时不可用";
      setSyncState("failed");
      setSyncError(message);
      updateProgress({ apiSyncState: "failed", apiError: message });
      submitLockRef.current = false;
    }
  }

  return (
    <H5Frame
      activeStep={1}
      backHref={syncState === "syncing" ? undefined : `/t/${inviteCode}`}
    >
      <section className={styles.formPage}>
        <div className={styles.pageHeading}>
          <p className={styles.eyebrow}>参与者背景</p>
          <h1>先认识一下你</h1>
          <p>
            这些信息帮助系统理解你的业务上下文，不用于绩效评估。
          </p>
        </div>

        <form
          className={styles.profileForm}
          onSubmit={submitProfile}
          aria-busy={syncState === "syncing"}
          noValidate
        >
          <div className={styles.fieldGroup}>
            <label htmlFor="name">
              姓名 <span>必填</span>
            </label>
            <input
              id="name"
              name="name"
              value={profile.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="例如：林晓岚"
              autoComplete="name"
              disabled={syncState === "syncing"}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <p id="name-error" className={styles.fieldError} role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="organization">
              所属机构 <span>必填</span>
            </label>
            <input
              id="organization"
              name="organization"
              value={profile.organization}
              onChange={(event) =>
                updateField("organization", event.target.value)
              }
              placeholder="例如：华东分公司"
              autoComplete="organization"
              disabled={syncState === "syncing"}
              aria-invalid={Boolean(errors.organization)}
              aria-describedby={
                errors.organization ? "organization-error" : undefined
              }
            />
            {errors.organization && (
              <p
                id="organization-error"
                className={styles.fieldError}
                role="alert"
              >
                {errors.organization}
              </p>
            )}
          </div>

          <div className={styles.fieldGroup}>
              <label htmlFor="years">
                从业年限 <span>必填</span>
              </label>
              <select
                id="years"
                name="years"
                value={profile.years}
                disabled={syncState === "syncing"}
                onChange={(event) => updateField("years", event.target.value)}
                aria-invalid={Boolean(errors.years)}
                aria-describedby={errors.years ? "years-error" : undefined}
              >
                <option value="">请选择</option>
                <option value="1年以内">1 年以内</option>
                <option value="1–3年">1–3 年</option>
                <option value="4–7年">4–7 年</option>
                <option value="8年及以上">8 年及以上</option>
              </select>
              {errors.years && (
                <p id="years-error" className={styles.fieldError} role="alert">
                  {errors.years}
                </p>
              )}
          </div>

          <div className={styles.formFootnote}>
            <span aria-hidden="true">i</span>
            <p>你填写的信息仅用于本次演示访谈，我们会为你保密，不用于绩效评估。</p>
          </div>

          <div aria-live="polite">
            {syncState === "failed" && (
              <div className={styles.formFootnote} role="alert">
                <span aria-hidden="true">!</span>
                <p>{syncError}。你可以重试，或继续使用纯本地演示。</p>
              </div>
            )}
          </div>

          <button
            className={styles.primaryButton}
            type="submit"
            disabled={syncState === "syncing"}
          >
            {syncState === "syncing"
              ? "正在创建访谈…"
              : existingInterviewId && profilesMatch(profile, initialProfile)
                ? "返回案例"
                : syncState === "failed"
                  ? "重试创建访谈"
                  : "保存并查看案例"}
          </button>
          {syncState === "failed" && (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={continueLocally}
            >
              继续本地演示
            </button>
          )}
        </form>
      </section>
    </H5Frame>
  );
}
