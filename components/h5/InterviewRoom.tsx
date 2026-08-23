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
import { participantHeaders } from "./auth-client";
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
  InterviewDimension,
} from "./types";
import styles from "./h5.module.css";

type UpdateProgress = ReturnType<typeof useH5Progress>["updateProgress"];
type RecordingState = "idle" | "recording" | "transcribing" | "review";
type ApiMessagePayload = {
  data?: {
    assistantMessage: { id: string; content: string; createdAt: string } | null;
    agent: {
      currentStage: string;
      informationState: ApiInformationState;
    };
  };
  error?: { message?: string };
};

type ApiCompletePayload = {
  data?: { extractedCase: H5Progress["apiExtractedCase"] };
  error?: { message?: string };
};

const suggestionByDimension: Record<InterviewDimension, string> = {
  discovery:
    "我会先看连续三个月的续保率与成交率趋势，如果连续两个周期偏离网点常态，就会介入排查。",
  judgement:
    "我会按销售顾问对比报价量、推荐记录和成交率，再抽访未成交客户，排除是流量还是竞品影响。",
  action:
    "我会先用数据和客户反馈复核原因，然后与店总和销售顾问沟通，按问题环节调整跟进动作。",
  result:
    "我会每周复盘推荐率和报价成交率，先看过程指标是否恢复，再观察续保率的结果变化。",
  boundary:
    "如果是新建网点、客户池还不稳定，这种方法不能直接套用；也要避免在证据不足时归因于竞品。",
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
    if (!progress.profile.name) {
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
    !progress.profile.name ||
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
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [agentTyping, setAgentTyping] = useState(
    progress.messages.at(-1)?.role === "user",
  );
  const [recordingState, setRecordingState] =
    useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [confirmingTranscript, setConfirmingTranscript] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [showSubmitCheck, setShowSubmitCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);
  const submissionLockRef = useRef(false);
  const transcriptConfirmLockRef = useRef(false);

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
  const completeDimensionCount = dimensions.filter(
    ({ id }) => progress.coverage[id] === 2,
  ).length;
  const incompleteDimensionCount = dimensions.length - completeDimensionCount;
  const lastMessage = progress.messages.at(-1);
  const nextQuestionForCoverage = getNextQuestion(progress.coverage);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [agentTyping, visibleMessages.length]);

  useEffect(() => {
    if (!agentTyping || lastMessage?.role !== "user") return;
    let cancelled = false;

    typingTimerRef.current = setTimeout(async () => {
      let agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        target: nextQuestionForCoverage.target,
        content: nextQuestionForCoverage.content,
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
          apiSyncState = "synced";
        } catch (error) {
          if (cancelled) return;
          apiSyncState = "failed";
          apiError = error instanceof Error ? error.message : "访谈对话同步失败";
        }
      }

      if (cancelled) return;
      updateProgress((current) => ({
        ...current,
        messages: current.messages.some(({ id }) => id === agentMessage.id)
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
      setSaveState("saved");
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, updateProgress]);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      void recorderRef.current?.cancel();
    };
  }, []);

  function sendAnswer(event?: FormEvent) {
    event?.preventDefault();
    const answer = draft.trim();
    if (!answer || agentTyping) return;

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
    setSaveState("saved");
    setAgentTyping(true);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendAnswer();
    }
  }

  async function startOrStopRecording() {
    if (recordingState === "idle" || recordingState === "review") {
      try {
        setTranscript(""); setTranscriptId(null); setRecordingError(null); setRecordingSeconds(0);
        const recorder = new PcmRecorder(); recorderRef.current = recorder;
        await recorder.start(); setRecordingState("recording");
      } catch (error) { setRecordingError(error instanceof Error ? error.message : "无法打开麦克风，请改用文字输入"); setRecordingState("idle"); }
      return;
    }

    if (recordingState === "recording") {
      try {
        setRecordingState("transcribing");
        const captured = await recorderRef.current?.stop(); recorderRef.current = null;
        if (!captured || !progress.apiInterviewId) throw new Error("访谈尚未初始化，请改用文字输入或刷新后重试");
        const form = new FormData(); form.set("interviewId", progress.apiInterviewId); form.set("audio", new File([captured.audio], "interview.pcm", { type: "audio/pcm" })); form.set("durationMs", String(captured.durationMs)); form.set("consented", "true"); form.set("language", "zh-CN");
        const uploaded = await fetch("/api/speech/upload", { method: "POST", headers: await participantHeaders(), body: form }); const uploadPayload = await uploaded.json(); if (!uploaded.ok || !uploadPayload.data?.transcriptId) throw new Error(uploadPayload.error?.message || "音频上传失败");
        const response = await fetch("/api/speech/transcribe", { method: "POST", headers: await participantHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ transcriptId: uploadPayload.data.transcriptId }) }); const payload = await response.json(); if (!response.ok || !payload.data?.text) throw new Error(payload.error?.message || "转写失败");
        setTranscriptId(payload.data.transcriptId); setTranscript(payload.data.text); setRecordingState("review");
      } catch (error) { setRecordingError(error instanceof Error ? error.message : "转写失败，请改用文字输入"); setRecordingState("idle"); }
    }
  }

  async function useTranscript() {
    if (transcriptId && progress.apiInterviewId) {
      if (transcriptConfirmLockRef.current) return;
      transcriptConfirmLockRef.current = true;
      setConfirmingTranscript(true);
      try {
        // Keep this key stable for the transcript so retrying, a double-click,
        // or a second tab reaches the message repository's existing idempotency
        // guard instead of creating duplicate participant answers.
        const id = `audio-${transcriptId}`; const response = await fetch(`/api/speech/transcribe/${encodeURIComponent(transcriptId)}/confirm`, { method: "POST", headers: await participantHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ interviewId: progress.apiInterviewId, content: transcript, clientMessageId: id }) }); const payload = await response.json(); if (!response.ok || !payload.data?.assistantMessage) throw new Error(payload.error?.message || "确认转写失败"); const now = new Date().toISOString();
        updateProgress((current) => ({ ...current, messages: [...(current.messages.length ? current.messages : [{ ...initialAgentMessage, createdAt: now }]), { id, role: "user", content: transcript, createdAt: now }, { id: payload.data.assistantMessage.id, role: "agent", target: mapApiStage(payload.data.agent.currentStage), content: payload.data.assistantMessage.content, createdAt: payload.data.assistantMessage.createdAt }], coverage: mergeApiCoverage(updateCoverage(current.coverage, transcript, currentPrompt?.target), payload.data.agent.informationState), apiSyncState: "synced", apiError: null }));
        setRecordingState("idle"); setTranscript(""); setTranscriptId(null); return;
      } catch (error) { setRecordingError(error instanceof Error ? error.message : "确认转写失败"); return; } finally { transcriptConfirmLockRef.current = false; setConfirmingTranscript(false); }
    }
    setDraft((current) =>
      current.trim() ? `${current.trim()}\n${transcript}` : transcript,
    );
    setSaveState("saving");
    setRecordingState("idle");
    setTranscript(""); setTranscriptId(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function requestSubmit() {
    if (userMessageCount === 0) return;
    if (incompleteDimensionCount > 0) {
      setShowSubmitCheck(true);
      return;
    }
    void completeSubmission();
  }

  async function completeSubmission() {
    if (submitting || submissionLockRef.current) return;
    submissionLockRef.current = true;
    setSubmitting(true);
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
      apiSyncState,
      apiError,
    }));
    router.push(`/t/${inviteCode}/complete`);
  }

  return (
    <H5Frame activeStep={3} backHref={`/t/${inviteCode}/challenge`}>
      <section className={styles.interviewPage}>
        <header className={styles.interviewHeader}>
          <div>
            <p className={styles.eyebrow}>AI 陪练访谈</p>
            <h1>续保异常诊断复盘</h1>
          </div>
          <button
            className={styles.submitButton}
            type="button"
            disabled={userMessageCount === 0 || agentTyping || submitting}
            onClick={requestSubmit}
          >
            {submitting ? "提交中…" : "提交并结束访谈"}
          </button>
        </header>

        <section className={styles.coveragePanel} aria-labelledby="coverage-title">
          <div className={styles.coverageHeading}>
            <div>
              <p className={styles.eyebrow}>经验覆盖</p>
              <h2 id="coverage-title">{completeDimensionCount}/5 个方面已完整</h2>
            </div>
            <span>{Math.round((completeDimensionCount / 5) * 100)}%</span>
          </div>
          <ol className={styles.dimensionList}>
            {dimensions.map((dimension) => {
              const level = progress.coverage[dimension.id];
              const label = level === 2 ? "完整" : level === 1 ? "部分" : "待补充";
              return (
                <li key={dimension.id} data-level={level}>
                  <span aria-hidden="true" />
                  <small>{dimension.shortLabel}</small>
                  <span className={styles.srOnly}>：{label}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <details className={styles.caseDrawer}>
          <summary>
            <span>案例摘要</span>
            <strong>{progress.apiChallenge?.title ?? challengeMock.title}</strong>
          </summary>
          <p>{progress.apiChallenge?.description ?? challengeMock.description}</p>
        </details>

        <div
          className={styles.chatLog}
          ref={chatLogRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="AI 陪练对话"
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
                <strong>{message.role === "agent" ? "AI 陪练" : "你"}</strong>
                <time dateTime={message.createdAt}>
                  {formatClock(message.createdAt)}
                </time>
              </div>
              <p>{message.content}</p>
            </article>
          ))}
          {agentTyping && (
            <div className={styles.typingState} role="status">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <p>AI 正在根据当前缺口选择下一问</p>
            </div>
          )}
        </div>

        <section className={styles.composerArea} aria-label="回答输入">
          <div className={styles.mockModeLine}>
            <span>{progress.apiInterviewId ? "已连接" : "本地演示"}</span>
            <p>
              {progress.apiSyncState === "synced"
                ? "已同步受控访谈；模型与语音服务按服务端配置运行"
                : progress.apiSyncState === "syncing"
                  ? "正在同步受控访谈"
                  : progress.apiSyncState === "failed"
                    ? "服务端暂未同步，已保留本地演示数据"
                    : "当前为本地演示，未调用服务端能力"}
            </p>
          </div>

          {recordingState !== "idle" && (
            <div className={styles.recordingPanel} aria-live="polite">
              {recordingState === "recording" && (
                <>
                  <div className={styles.recordingLive}>
                    <span aria-hidden="true" />
                    <div>
                      <strong>录音中</strong>
                      <p>{formatDuration(recordingSeconds)} · 点击停止</p>
                    </div>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={startOrStopRecording}
                  >
                    停止并转写
                  </button>
                </>
              )}
              {recordingState === "transcribing" && (
                <div className={styles.transcribingState} role="status">
                  <span aria-hidden="true" />
                  <div>
                    <strong>正在转写</strong>
                    <p>通常接近录音时长，完成后可编辑确认；音频私有保存，确认前不会写入访谈</p>
                  </div>
                </div>
              )}
              {recordingState === "review" && (
                <div className={styles.transcriptReview}>
                  <label htmlFor="mock-transcript">转写结果（可编辑）</label>
                  <textarea
                    id="mock-transcript"
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    rows={5}
                  />
                  <div>
                    <button
                      className={styles.quietButton}
                      type="button"
                      onClick={startOrStopRecording}
                    >
                      重新录音
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={useTranscript}
                      disabled={!transcript.trim() || confirmingTranscript}
                    >
                      {confirmingTranscript ? "确认中…" : "使用这段文字"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentPrompt?.target && recordingState === "idle" && (
            <button
              className={styles.answerPrompt}
              type="button"
              onClick={() => {
                setDraft(suggestionByDimension[currentPrompt.target!]);
                setSaveState("saving");
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
            >
              <span>演示回答框架</span>
              <p>填入一段针对当前问题的示例文字，你仍可编辑</p>
            </button>
          )}

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
                setSaveState("saving");
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder="说说你的实际判断……"
              rows={3}
            />
            <div className={styles.composerActions}>
              <button
                className={styles.recordButton}
                type="button"
                onClick={startOrStopRecording}
                disabled={
                  recordingState === "transcribing" || agentTyping
                }
                aria-pressed={recordingState === "recording"}
              >
                {recordingState === "recording" ? "停止录音" : "录音回答"}
              </button>
              <button
                className={styles.sendButton}
                type="submit"
                disabled={!draft.trim() || agentTyping}
              >
                发送
              </button>
            </div>
          </form>

          {recordingError && <p role="alert" className={styles.saveLine}>{recordingError}</p>}

          <div className={styles.saveLine} aria-live="polite" aria-atomic="true">
            <span data-state={saveState} aria-hidden="true" />
            {saveState === "saving"
              ? "正在保存本地草稿"
              : progress.lastSavedAt
                ? `已自动保存 · ${formatClock(progress.lastSavedAt)}`
                : "已开启本地自动保存"}
          </div>
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
              <p className={styles.eyebrow}>提交前检查</p>
              <h2 id="submit-check-title">还有 {incompleteDimensionCount} 个方面未完整</h2>
              <p>
                继续回答能让经验规则更可用。你也可以保留当前内容并直接提交。
              </p>
              <div>
                <button
                  className={styles.quietButton}
                  type="button"
                  onClick={() => setShowSubmitCheck(false)}
                  autoFocus
                >
                  继续访谈
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void completeSubmission()}
                  disabled={submitting}
                >
                  {submitting ? "提交中…" : "提交并结束访谈"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </H5Frame>
  );
}
