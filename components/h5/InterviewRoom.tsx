"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  challengeMock,
  dimensions,
  getNextQuestion,
  initialAgentMessage,
  updateCoverage,
} from "./mock-data";
import { PcmRecorder } from "./pcm-recorder";
import { ensureAnonymousSession, participantHeaders } from "./auth-client";
import { H5Frame, LoadingPanel } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import {
  mapApiStage,
  mergeApiCoverage,
  type ApiInformationState,
} from "./api-contract";
import type {
  ChatMessage,
  H5Progress,
} from "./types";
import styles from "./h5.module.css";

type UpdateProgress = ReturnType<typeof useH5Progress>["updateProgress"];
type RecordingState = "idle" | "recording" | "transcribing";
type InputMode = "voice" | "text";
type CapturedAudio = { audio: ArrayBuffer; durationMs: number };
type ApiMessagePayload = {
  data?: {
    assistantMessage: { id: string; content: string; createdAt: string } | null;
    agent: {
      currentStage: string;
      informationState: ApiInformationState;
      isComplete?: boolean;
    };
  };
  error?: { message?: string };
};

type ApiCompletePayload = {
  data?: { extractedCase: H5Progress["apiExtractedCase"] };
  error?: { message?: string };
};

type PublicTaskPayload = {
  data?: {
    id: string;
    scenario: {
      customFields: Array<{ fieldName: string }>;
    };
  };
  error?: { message?: string };
};

type StartInterviewPayload = {
  data?: {
    interview: { id: string };
    challengeCase: { title: string; description: string };
    assistantMessage: { id: string; content: string; createdAt: string };
    agent: { currentStage: string; informationState: ApiInformationState };
  };
  error?: { message?: string };
};

// Kept local for this P1 experience release. It can later be sourced from task configuration.
const MAX_AUDIO_DURATION_SECONDS = 90;
const legacyProfileKeys: Record<string, keyof H5Progress["profile"]> = {
  姓名: "name",
  机构: "organization",
  岗位: "role",
  从业年限: "years",
  网点数量: "networkCount",
};

function formatClock(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function InterviewRoom({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);

  useEffect(() => {
    if (!ready) return;
    if (!progress.privacyAccepted) {
      router.replace(`/t/${inviteCode}`);
      return;
    }
    if (!hasProfileData(progress.profile)) {
      router.replace(`/t/${inviteCode}/profile`);
      return;
    }
    if (progress.status === "submitted") {
      router.replace(`/t/${inviteCode}/complete`);
    }
  }, [inviteCode, progress, ready, router]);

  if (
    !ready ||
    !progress.privacyAccepted ||
    !hasProfileData(progress.profile) ||
    progress.status === "submitted"
  ) {
    return (
      <H5Frame activeStep={3} backHref={`/t/${inviteCode}/challenge`}>
        <LoadingPanel label="正在恢复访谈记录" />
      </H5Frame>
    );
  }

  return (
    <InterviewSession
      inviteCode={inviteCode}
      progress={progress}
      updateProgress={updateProgress}
    />
  );
}

function hasProfileData(profile: H5Progress["profile"]) {
  return Object.values(profile).some((value) => value.trim().length > 0);
}

function InterviewSession({
  inviteCode,
  progress,
  updateProgress,
}: {
  inviteCode: string;
  progress: H5Progress;
  updateProgress: UpdateProgress;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(progress.draft);
  const [agentTyping, setAgentTyping] = useState(
    progress.messages.at(-1)?.role === "user",
  );
  const [recordingState, setRecordingState] =
    useState<RecordingState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const [sessionRecoveryError, setSessionRecoveryError] = useState<string | null>(null);
  const [autoClosing, setAutoClosing] = useState(false);
  const [showSubmitCheck, setShowSubmitCheck] = useState(false);
  const [caseExpanded, setCaseExpanded] = useState(false);
  const [caseCanExpand, setCaseCanExpand] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);
  const capturedAudioRef = useRef<CapturedAudio | null>(null);
  const transcriptIdRef = useRef<string | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const transcribeLockRef = useRef(false);
  const cancelledTranscriptionRef = useRef(false);
  const recordingStopLockRef = useRef(false);
  const sendLockRef = useRef(false);
  const sessionRecoveryRef = useRef<Promise<string | null> | null>(null);
  const submissionLockRef = useRef(false);

  const visibleMessages = useMemo(() => {
    if (progress.messages.length > 0) return progress.messages;
    return [initialAgentMessage];
  }, [progress.messages]);

  const currentPrompt = [...visibleMessages]
    .reverse()
    .find((message) => message.role === "agent");
  const userMessageCount = progress.messages.filter(
    (message) => message.role === "user",
  ).length;
  const missingDimension = dimensions.find(
    ({ id }) => progress.coverage[id] < 2,
  );
  const informationComplete = !missingDimension;
  const lastMessage = progress.messages.at(-1);
  const nextQuestionForCoverage = getNextQuestion(progress.coverage);
  const caseDescription = progress.apiChallenge?.description ?? challengeMock.description;
  const caseDescriptionRef = useRef<HTMLParagraphElement>(null);
  const remainingRecordingSeconds = Math.max(
    MAX_AUDIO_DURATION_SECONDS - recordingSeconds,
    0,
  );
  const recordingHint =
    remainingRecordingSeconds <= 5
      ? `还剩 ${remainingRecordingSeconds} 秒，请尽快完成本轮回答`
      : remainingRecordingSeconds <= 10
        ? `还剩 ${remainingRecordingSeconds} 秒，请尽量完成本轮回答`
        : `还剩 ${remainingRecordingSeconds} 秒`;

  useEffect(() => {
    if (caseExpanded) return;
    const updateOverflow = () => {
      const element = caseDescriptionRef.current;
      setCaseCanExpand(Boolean(element && element.scrollHeight > element.clientHeight + 1));
    };
    updateOverflow();
    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, [caseDescription, caseExpanded]);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [agentTyping, inputMode, visibleMessages.length]);

  useEffect(() => {
    if (!agentTyping || lastMessage?.role !== "user") return;
    let cancelled = false;

    typingTimerRef.current = setTimeout(async () => {
      let shouldAutoClose = !progress.apiInterviewId && informationComplete;
      let agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        target: nextQuestionForCoverage.target,
        content: shouldAutoClose
          ? "这个案例基本聊清楚了，我帮你整理一下。"
          : nextQuestionForCoverage.content,
        createdAt: new Date().toISOString(),
      };
      const shouldSyncApi = Boolean(progress.apiInterviewId);
      let apiSyncState: H5Progress["apiSyncState"] = shouldSyncApi
        ? "syncing"
        : progress.apiSyncState;
      let apiError: string | null = shouldSyncApi ? null : progress.apiError;
      let apiInformationState: ApiInformationState | undefined;

      if (shouldSyncApi && progress.apiInterviewId) {
        try {
          const response = await fetch("/api/interviews/message", {
            method: "POST",
            headers: await participantHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              interviewId: progress.apiInterviewId,
              content: lastMessage.content,
              type: "text",
              clientMessageId: lastMessage.id,
            }),
          });
          const payload = (await response.json()) as ApiMessagePayload;
          if (!response.ok || !payload.data?.assistantMessage) {
            throw new Error(payload.error?.message || "访谈对话同步失败");
          }
          agentMessage = {
            id: payload.data.assistantMessage.id,
            role: "agent",
            target: mapApiStage(payload.data.agent.currentStage),
            content: payload.data.assistantMessage.content,
            createdAt: payload.data.assistantMessage.createdAt,
          };
          apiInformationState = payload.data.agent.informationState;
          shouldAutoClose = Boolean(payload.data.agent.isComplete);
          apiSyncState = "synced";
        } catch (error) {
          if (cancelled) return;
          apiSyncState = "failed";
          apiError = error instanceof Error ? error.message : "访谈对话同步失败";
          shouldAutoClose = false;
        }
      }

      if (cancelled) return;
      updateProgress((current) => ({
        ...current,
        messages: shouldSyncApi && apiSyncState === "failed"
          ? current.messages
          : current.messages.some(({ id }) => id === agentMessage.id)
          ? current.messages
          : [...current.messages, agentMessage],
        coverage: mergeApiCoverage(
          current.coverage,
          apiInformationState,
        ),
        apiSyncState,
        apiError,
      }));
      setAgentTyping(false);
      sendLockRef.current = false;
      if (shouldAutoClose) setAutoClosing(true);
    }, 760);

    return () => {
      cancelled = true;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [
    agentTyping,
    lastMessage?.content,
    lastMessage?.id,
    lastMessage?.role,
    nextQuestionForCoverage.content,
    nextQuestionForCoverage.target,
    informationComplete,
    progress.apiInterviewId,
    progress.apiError,
    progress.apiSyncState,
    updateProgress,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString();
      updateProgress((current) => ({
        ...current,
        draft,
        lastSavedAt: savedAt,
        status:
          current.status === "submitted" ? "submitted" : "interview",
      }));
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, updateProgress]);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = setInterval(() => {
      setRecordingSeconds((seconds) =>
        Math.min(seconds + 1, MAX_AUDIO_DURATION_SECONDS),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    if (
      recordingState !== "recording" ||
      recordingSeconds < MAX_AUDIO_DURATION_SECONDS
    ) {
      return;
    }
    void finishRecording();
    // finishRecording only operates on the active recorder held in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingSeconds, recordingState]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && recordingState === "recording") {
        void finishRecording();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // finishRecording intentionally operates on the active recorder instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      transcribeAbortRef.current?.abort();
      void recorderRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!autoClosing) return;
    closingTimerRef.current = setTimeout(() => {
      void completeSubmission();
    }, 900);
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    };
    // completeSubmission uses the current interview ID and the existing
    // completion endpoint; autoClosing is the only new presentation trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClosing]);

  async function recoverInterviewSession() {
    if (progress.apiInterviewId) return progress.apiInterviewId;
    if (sessionRecoveryRef.current) return sessionRecoveryRef.current;

    const recovery = (async () => {
      setSessionRecovering(true);
      setSessionRecoveryError(null);
      try {
        await ensureAnonymousSession();
        const taskResponse = await fetch(
          `/api/tasks/by-invite/${encodeURIComponent(inviteCode)}`,
          { cache: "no-store", headers: await participantHeaders() },
        );
        const taskPayload = (await taskResponse.json()) as PublicTaskPayload;
        if (!taskResponse.ok || !taskPayload.data) {
          throw new Error(taskPayload.error?.message || "未找到对应任务");
        }

        const profile = Object.fromEntries(
          taskPayload.data.scenario.customFields
            .map(({ fieldName }) => {
              const legacyKey = legacyProfileKeys[fieldName];
              const value = progress.profile[fieldName] ?? (legacyKey ? progress.profile[legacyKey] : "");
              return [fieldName, value.trim()];
            })
            .filter(([, value]) => value.length > 0),
        );
        const startResponse = await fetch("/api/interviews/start", {
          method: "POST",
          headers: await participantHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ taskId: taskPayload.data.id, profile }),
        });
        const startPayload = (await startResponse.json()) as StartInterviewPayload;
        if (
          !startResponse.ok ||
          !startPayload.data?.interview.id ||
          !startPayload.data.assistantMessage
        ) {
          throw new Error(startPayload.error?.message || "访谈会话恢复失败");
        }

        const started = startPayload.data;
        updateProgress((current) => ({
          ...current,
          status: "interview",
          // Local-only records cannot be safely补写到服务端；用服务端首问重新建立一条可追踪会话。
          messages: [{
            id: started.assistantMessage.id,
            role: "agent",
            target: mapApiStage(started.agent.currentStage),
            content: started.assistantMessage.content,
            createdAt: started.assistantMessage.createdAt,
          }],
          coverage: mergeApiCoverage({ ...current.coverage }, started.agent.informationState),
          apiInterviewId: started.interview.id,
          apiChallenge: {
            title: started.challengeCase.title,
            description: started.challengeCase.description,
          },
          apiSyncState: "synced",
          apiError: null,
        }));
        return started.interview.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "访谈会话恢复失败";
        setSessionRecoveryError(message);
        return null;
      } finally {
        setSessionRecovering(false);
        sessionRecoveryRef.current = null;
      }
    })();
    sessionRecoveryRef.current = recovery;
    return recovery;
  }

  useEffect(() => {
    if (progress.apiInterviewId || !hasProfileData(progress.profile)) return;
    void recoverInterviewSession();
    // The recovery is intentionally triggered once for an old local-only session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.apiInterviewId]);

  function sendAnswer(event?: FormEvent) {
    event?.preventDefault();
    submitAnswer(draft);
  }

  function submitAnswer(content: string, allowDuringTranscription = false) {
    const answer = content.trim();
    if (
      !answer ||
      agentTyping ||
      (recordingState === "transcribing" && !allowDuringTranscription) ||
      sendLockRef.current
    ) {
      return;
    }
    sendLockRef.current = true;

    const now = new Date().toISOString();
    const baseMessages =
      progress.messages.length > 0
        ? progress.messages
        : [{ ...initialAgentMessage, createdAt: now }];
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: answer,
      createdAt: now,
    };
    const nextCoverage = updateCoverage(
      progress.coverage,
      answer,
      currentPrompt?.target,
    );
    updateProgress((current) => ({
      ...current,
      messages: [...baseMessages, userMessage],
      coverage: nextCoverage,
      draft: "",
      lastSavedAt: now,
      status: "interview",
      apiSyncState: current.apiInterviewId
        ? "syncing"
        : current.apiSyncState,
      apiError: current.apiInterviewId ? null : current.apiError,
    }));
    setDraft("");
    setAgentTyping(true);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendAnswer();
    }
  }

  async function transcribeCapturedAudio(interviewId = progress.apiInterviewId) {
    const captured = capturedAudioRef.current;
    if (!captured || !interviewId || transcribeLockRef.current) return;
    transcribeLockRef.current = true;
    setRecordingState("transcribing");
    setRecordingError(null);
    const abortController = new AbortController();
    transcribeAbortRef.current = abortController;
    // iFlytek processes PCM in real time. The UI allows 90-second answers, so
    // a 35-second client timeout would make valid long answers fail.
    const timeout = window.setTimeout(() => abortController.abort(), 135_000);

    try {
      if (!transcriptIdRef.current) {
        const form = new FormData();
        form.set("interviewId", interviewId);
        form.set("audio", new File([captured.audio], "interview.pcm", { type: "audio/pcm" }));
        form.set("durationMs", String(captured.durationMs));
        form.set("consented", "true");
        form.set("language", "zh-CN");
        const uploaded = await fetch("/api/speech/upload", {
          method: "POST",
          headers: await participantHeaders(),
          body: form,
          signal: abortController.signal,
        });
        const uploadPayload = await uploaded.json();
        if (!uploaded.ok || !uploadPayload.data?.transcriptId) {
          throw new Error(uploadPayload.error?.message || "录音上传失败");
        }
        transcriptIdRef.current = uploadPayload.data.transcriptId;
      }

      const response = await fetch("/api/speech/transcribe", {
        method: "POST",
        headers: await participantHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ transcriptId: transcriptIdRef.current }),
        signal: abortController.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload.data?.text) {
        throw new Error(payload.error?.message || "未能识别出有效内容");
      }
      capturedAudioRef.current = null;
      setHasPendingAudio(false);
      transcriptIdRef.current = null;
      setRecordingState("idle");
      submitAnswer(payload.data.text, true);
    } catch (error) {
      if (cancelledTranscriptionRef.current) {
        setRecordingError(null);
      } else if (abortController.signal.aborted) {
        setRecordingError("转写已暂停，录音已保留，可稍后重试");
      } else {
        setRecordingError(error instanceof Error ? `${error.message}，录音已保留，可重试` : "转写失败，录音已保留，可重试");
      }
      setRecordingState("idle");
    } finally {
      window.clearTimeout(timeout);
      transcribeAbortRef.current = null;
      transcribeLockRef.current = false;
      cancelledTranscriptionRef.current = false;
    }
  }

  async function finishRecording() {
    if (recordingStopLockRef.current) return;
    recordingStopLockRef.current = true;
    try {
      const captured = await recorderRef.current?.stop();
      recorderRef.current = null;
      if (!captured || captured.durationMs < 500) {
        setRecordingState("idle");
        setRecordingError("录音时间太短，请再说完整一些");
        return;
      }
      const interviewId = progress.apiInterviewId ?? await recoverInterviewSession();
      if (!interviewId) {
        setRecordingState("idle");
        setRecordingError(sessionRecoveryError || "无法恢复访谈会话，请改用文字输入或稍后重试");
        return;
      }
      capturedAudioRef.current = captured;
      setHasPendingAudio(true);
      void transcribeCapturedAudio(interviewId);
    } finally {
      recordingStopLockRef.current = false;
    }
  }

  async function startOrStopRecording() {
    if (recordingState === "transcribing") return;
    if (recordingState === "idle") {
      try {
        capturedAudioRef.current = null;
        setHasPendingAudio(false);
        transcriptIdRef.current = null;
        setRecordingError(null);
        setRecordingSeconds(0);
        setInputMode("voice");
        const recorder = new PcmRecorder();
        recorderRef.current = recorder;
        await recorder.start();
        setRecordingState("recording");
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : "无法打开麦克风，请改用文字输入");
      }
      return;
    }

    await finishRecording();
  }

  async function cancelRecording() {
    cancelledTranscriptionRef.current = true;
    transcribeAbortRef.current?.abort();
    await recorderRef.current?.cancel();
    recorderRef.current = null;
    capturedAudioRef.current = null;
    setHasPendingAudio(false);
    transcriptIdRef.current = null;
    setRecordingSeconds(0);
    setRecordingError(null);
    setRecordingState("idle");
  }

  function requestSubmit() {
    if (userMessageCount === 0) return;
    if (informationComplete) {
      void completeSubmission();
      return;
    }
    setShowSubmitCheck(true);
  }

  async function completeSubmission() {
    if (submitting || submissionLockRef.current) return;
    submissionLockRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    let apiSyncState = progress.apiSyncState;
    let apiError = progress.apiError;
    let apiExtractedCase = progress.apiExtractedCase;

    if (progress.apiInterviewId) {
      try {
        updateProgress({ apiSyncState: "syncing", apiError: null });
        const response = await fetch(
          `/api/interviews/${encodeURIComponent(progress.apiInterviewId)}/complete`,
          { method: "POST", headers: await participantHeaders() },
        );
        const payload = (await response.json()) as ApiCompletePayload;
        if (!response.ok || !payload.data?.extractedCase) {
          throw new Error(payload.error?.message || "访谈提交失败");
        }
        apiExtractedCase = payload.data.extractedCase;
        apiSyncState = "synced";
        apiError = null;
      } catch (error) {
        apiSyncState = "failed";
        apiError = error instanceof Error ? error.message : "访谈提交失败";
        updateProgress({ apiSyncState, apiError });
        setSubmissionError(`${apiError}，你的对话已保留，可以重试`);
        setAutoClosing(false);
        setSubmitting(false);
        submissionLockRef.current = false;
        return;
      }
    }

    const completedAt = new Date().toISOString();
    updateProgress((current) => ({
      ...current,
      status: "submitted",
      completedAt,
      draft,
      lastSavedAt: completedAt,
      apiExtractedCase,
      caseReviewStatus: "ai_generated",
      caseReviewConfirmed: false,
      apiSyncState,
      apiError,
    }));
    router.push(`/t/${inviteCode}/complete`);
  }

  return (
    <H5Frame activeStep={3} backHref={`/t/${inviteCode}/profile`}>
      <section className={styles.interviewPage} data-input-mode={inputMode}>
        <header className={styles.interviewHeader}>
          <div>
            <p className={styles.eyebrow}>AI访谈</p>
            <h1>续保异常诊断复盘</h1>
            <p className={styles.interviewSaveStatus}>
              <span aria-hidden="true" /> 已自动保存
            </p>
          </div>
          <button
            className={styles.submitButton}
            type="button"
            disabled={userMessageCount === 0 || agentTyping || submitting || autoClosing}
            onClick={requestSubmit}
          >
            {submitting ? "整理中…" : "结束本次访谈"}
          </button>
        </header>

        <section className={styles.caseDrawer} aria-labelledby="case-summary-title">
          <button
            className={styles.caseSummaryToggle}
            type="button"
            aria-expanded={caseCanExpand ? caseExpanded : undefined}
            disabled={!caseCanExpand}
            onClick={() => setCaseExpanded((current) => !current)}
          >
            <span>案例摘要</span>
            <strong id="case-summary-title">{progress.apiChallenge?.title ?? challengeMock.title}</strong>
            {caseCanExpand && <span className={styles.caseExpandLabel}>{caseExpanded ? "收起" : "...展开"}</span>}
          </button>
          <p ref={caseDescriptionRef} className={caseExpanded ? styles.caseDescriptionExpanded : styles.caseDescriptionCollapsed}>
            {caseDescription}
          </p>
        </section>

        <div
          className={styles.chatLog}
          ref={chatLogRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="AI访谈对话"
        >
          {visibleMessages.map((message) => (
            <article
              className={
                message.role === "agent"
                  ? styles.agentMessage
                  : styles.userMessage
              }
              key={message.id}
            >
              <div className={styles.messageMeta}>
                {message.role === "agent" && <span className={styles.assistantAvatar} aria-hidden="true" />}
                <strong>{message.role === "agent" ? "访谈助手" : "你"}</strong>
                <time dateTime={message.createdAt}>
                  {formatClock(message.createdAt)}
                </time>
              </div>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <section className={styles.composerArea} aria-label="回答输入">
          {recordingState === "recording" && (
            <div className={styles.voiceRecordingPanel} aria-live="polite">
              <div className={styles.voiceRecordingHeading}>
                <span className={styles.voicePulse} aria-hidden="true" />
                <strong>正在录音</strong>
                <time>{formatDuration(recordingSeconds)} / {formatDuration(MAX_AUDIO_DURATION_SECONDS)}</time>
              </div>
              <div className={styles.recordingProgress} aria-hidden="true">
                <span style={{ width: `${(recordingSeconds / MAX_AUDIO_DURATION_SECONDS) * 100}%` }} />
              </div>
              <p className={remainingRecordingSeconds <= 10 ? styles.recordingHintUrgent : styles.recordingHint}>{recordingHint}</p>
              <div className={styles.voiceRecordingActions}>
                <button type="button" onClick={() => void cancelRecording()}>取消</button>
                <button type="button" className={styles.voiceFinishButton} onClick={() => void startOrStopRecording()}>结束回答</button>
              </div>
            </div>
          )}
          {(recordingState === "transcribing" || agentTyping || sessionRecovering || autoClosing) && (
            <div className={styles.answerProcessingPanel} role="status" aria-live="polite">
              <span className={styles.processingCheck} aria-hidden="true">✓</span>
              <div>
                <strong>回答已记录</strong>
                <p>{autoClosing ? "正在整理你的案例…" : sessionRecovering ? "正在恢复你的访谈…" : recordingState === "transcribing" ? "正在理解你刚才的内容…" : "正在准备下一个问题…"}</p>
              </div>
            </div>
          )}

          {recordingState === "idle" && !agentTyping && !sessionRecovering && !autoClosing && inputMode === "voice" && (
            <div className={styles.voiceAnswerPanel}>
              <div className={styles.voiceAnswerActions}>
                <button className={styles.inputModeToggle} type="button" onClick={() => { setInputMode("text"); requestAnimationFrame(() => composerRef.current?.focus()); }}>⌨️ 文字回答</button>
                <button
                  className={styles.voiceStartButton}
                  type="button"
                  onClick={() => void startOrStopRecording()}
                >
                  <span className={styles.voiceStartIcon} aria-hidden="true"><i /></span>
                  <span><strong>语音回答</strong><small>本轮最长可回答 {MAX_AUDIO_DURATION_SECONDS} 秒</small></span>
                </button>
              </div>
            </div>
          )}

          {recordingState === "idle" && !agentTyping && !sessionRecovering && !autoClosing && inputMode === "text" && (
            <>
              <form className={styles.composer} onSubmit={sendAnswer}>
                <label className={styles.srOnly} htmlFor="answer-composer">
                  输入你的回答
                </label>
                <textarea
                  id="answer-composer"
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="请输入你的回答…"
                  rows={3}
                  enterKeyHint="send"
                />
                <div className={styles.composerActions}>
                  <button
                    className={styles.composerSendButton}
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="发送文字"
                  >
                    发送
                  </button>
                </div>
              </form>
              <button
                className={styles.inputModeToggle}
                type="button"
                onClick={() => setInputMode("voice")}
              >
                🎙 切回语音回答
              </button>
            </>
          )}

          {(recordingError || sessionRecoveryError || submissionError || progress.apiError) && <div className={styles.voiceError} role="alert"><p>{recordingError ?? sessionRecoveryError ?? submissionError ?? progress.apiError}</p>{hasPendingAudio && <><button type="button" onClick={() => void transcribeCapturedAudio()}>重新提交</button><button type="button" onClick={() => { void cancelRecording(); setInputMode("text"); }}>改用文字回答</button></>}{progress.apiSyncState === "failed" && !hasPendingAudio && <button type="button" onClick={() => setAgentTyping(true)}>重试同步</button>}</div>}
        </section>

        {showSubmitCheck && (
          <div
            className={styles.submitOverlay}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="submit-check-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowSubmitCheck(false);
            }}
          >
            <section className={styles.submitDialog}>
              <p className={styles.eyebrow}>结束访谈</p>
              <h2 id="submit-check-title">现在也可以结束</h2>
              <p>
                关于「{missingDimension?.label ?? "关键判断"}」还有一点信息没聊到。
              </p>
              <div>
                <button
                  className={styles.quietButton}
                  type="button"
                  onClick={() => setShowSubmitCheck(false)}
                  autoFocus
                >
                  继续聊聊
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void completeSubmission()}
                  disabled={submitting}
                >
                  {submitting ? "整理中…" : "直接整理"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </H5Frame>
  );
}
