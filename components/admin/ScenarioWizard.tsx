"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createAdminScenario, createAdminTask } from "./admin-data-client";

type WizardState = {
  name: string;
  objective: string;
  participantFields: string[];
  challengeRule: string;
  dimensions: string[];
  keywords: string[];
  caseMode: "fixed" | "variant";
  status: "draft" | "published";
};

const INTERNAL_AGENT_PROMPT =
  "你是一名保险业务经验萃取专家。请围绕用户的判断依据、行动原因和边界条件追问，不提供业务答案，不虚构用户未提及的事实。";

const EMPTY_FORM: WizardState = {
  name: "",
  objective: "",
  participantFields: ["姓名", "机构"],
  challengeRule: "",
  dimensions: ["机会发现", "判断逻辑", "行动策略", "效果反馈", "边界条件"],
  keywords: [],
  caseMode: "fixed",
  status: "published",
};

const STEPS = [
  { number: 1, title: "任务信息设置", note: "明确想萃取的经验" },
  { number: 2, title: "案例设置", note: "准备访谈场景与追问重点" },
  { number: 3, title: "保存 & 发布", note: "确认参与入口与保存方式" },
];

const DIMENSIONS = [
  { name: "机会发现", note: "什么信号引起了注意" },
  { name: "判断逻辑", note: "如何验证与排除备选原因" },
  { name: "行动策略", note: "做了什么，为什么这样做" },
  { name: "效果反馈", note: "哪些结果能够支持这条经验" },
  { name: "边界条件", note: "什么情况下不应使用" },
];

function toggleItem(items: string[], item: string) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
}

export function ScenarioWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [maxVisited, setMaxVisited] = useState(1);
  const [form, setForm] = useState<WizardState>(EMPTY_FORM);
  const [keywordInput, setKeywordInput] = useState("");
  const [participantInput, setParticipantInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [publishing, setPublishing] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function validateCurrentStep() {
    const nextErrors: Record<string, string> = {};
    if (step === 1) {
      if (!form.name.trim()) nextErrors.name = "请填写任务名称。";
      if (!form.objective.trim()) nextErrors.objective = "请说明希望萃取的经验。";
      if (!form.participantFields.length) nextErrors.participantFields = "请至少保留一项参与者信息。";
    }
    if (step === 2) {
      if (!form.challengeRule.trim()) nextErrors.challengeRule = "请描述希望模拟的案例。";
      if (!form.dimensions.length) nextErrors.dimensions = "请至少选择一个核心萃取维度。";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function nextStep() {
    if (!validateCurrentStep()) return;
    const next = Math.min(STEPS.length, step + 1);
    setStep(next);
    setMaxVisited((visited) => Math.max(visited, next));
  }

  function previousStep() {
    setErrors({});
    setStep((current) => Math.max(1, current - 1));
  }

  function addKeyword() {
    const keyword = keywordInput.trim();
    if (!keyword || form.keywords.includes(keyword)) return;
    update("keywords", [...form.keywords, keyword]);
    setKeywordInput("");
  }

  function addParticipantField() {
    const field = participantInput.trim();
    if (!field || form.participantFields.includes(field)) return;
    update("participantFields", [...form.participantFields, field]);
    setParticipantInput("");
  }

  async function publishScenario() {
    if (!validateCurrentStep()) return;
    setPublishing(true);

    try {
      const scenario = await createAdminScenario({
        name: form.name.trim(),
        topic: "机构经验萃取",
        background: form.objective.trim(),
        objective: form.objective.trim(),
        agentPrompt: INTERNAL_AGENT_PROMPT,
        keywords: form.keywords,
        outputSchema: { selectedDimensions: form.dimensions, caseMode: form.caseMode },
        caseTemplate: { instruction: form.challengeRule.trim(), metrics: form.dimensions, constraints: [] },
        customFields: form.participantFields.map((fieldName, sortOrder) => ({
          fieldName,
          fieldType: "text",
          options: [],
          required: fieldName === "姓名" || fieldName === "机构",
          sortOrder,
        })),
      });
      await createAdminTask({
        scenarioId: scenario.id,
        targetUser: "一线业务人员",
        expectedDurationMinutes: 15,
        status: form.status === "published" ? "active" : "draft",
      });
      router.push(`/admin/scenarios/${scenario.id}?created=1`);
    } catch (reason) {
      setPublishing(false);
      showToast(reason instanceof Error ? reason.message : "任务未能写入机构数据库，请稍后重试。");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < STEPS.length) nextStep();
    else publishScenario();
  }

  return (
    <div className="admin-wizard-page">
      <header className="admin-wizard-topbar">
        <div>
          <Link href="/admin/scenarios" className="admin-back-link">
            <span aria-hidden="true">←</span> 返回任务列表
          </Link>
          <h1>新建萃取任务</h1>
          <p>三步完成任务信息、案例设置与发布。</p>
        </div>
        <span className="admin-list-toolbar__count">机构数据库保存</span>
      </header>

      <div className="admin-wizard-layout">
        <aside className="admin-wizard-steps" aria-label="创建任务步骤">
          <div className="admin-wizard-steps__track" aria-hidden="true" />
          {STEPS.map((item) => {
            const current = item.number === step;
            const complete = item.number < step;
            const accessible = item.number <= maxVisited;
            return (
              <button
                key={item.number}
                type="button"
                className={`${current ? "is-current" : ""} ${complete ? "is-complete" : ""}`}
                aria-current={current ? "step" : undefined}
                disabled={!accessible}
                onClick={() => {
                  setErrors({});
                  setStep(item.number);
                }}
              >
                <span>{complete ? "✓" : String(item.number).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.note}</small>
                </div>
              </button>
            );
          })}
          <div className="admin-wizard-steps__note">
            <strong>机构数据保存</strong>
            <p>保存后会写入所属机构数据库，并由管理员权限与 RLS 保护。</p>
          </div>
        </aside>

        <form className="admin-wizard-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-wizard-form__head">
            <span>STEP {String(step).padStart(2, "0")}</span>
            <div>
              <h2>{STEPS[step - 1].title}</h2>
              <p>{STEPS[step - 1].note}</p>
            </div>
            <strong>{step}/3</strong>
          </div>

          <div className="admin-wizard-form__body">
            {step === 1 ? (
              <div className="admin-form-section">
                <div className="admin-field">
                  <label htmlFor="scenario-name">任务名称</label>
                  <input
                    id="scenario-name"
                    className="admin-input"
                    value={form.name}
                    aria-invalid={Boolean(errors.name)}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="例：续保异常网点优秀经验访谈"
                  />
                  {errors.name ? <p className="admin-field-error">{errors.name}</p> : null}
                </div>

                <div className="admin-field">
                  <label htmlFor="scenario-objective">你希望向一线人员萃取什么经验？</label>
                  <p className="admin-field__hint">用一句具体的问题描述，帮助 AI 理解访谈要聚焦的业务判断与行动。</p>
                  <textarea
                    id="scenario-objective"
                    className="admin-textarea admin-textarea--prompt"
                    value={form.objective}
                    aria-invalid={Boolean(errors.objective)}
                    onChange={(event) => update("objective", event.target.value)}
                    placeholder="例如：当网点续保率突然下降时，高手如何判断问题、采取什么动作、如何跟店总沟通？"
                  />
                  {errors.objective ? <p className="admin-field-error">{errors.objective}</p> : null}
                </div>

                <fieldset className="admin-fieldset">
                  <legend>参与者需要填写的信息</legend>
                  <p>用于理解回答者的业务上下文。请避免收集客户姓名、联系方式等敏感信息。</p>
                  <div className="admin-inline-field">
                    <input
                      id="participant-field"
                      className="admin-input"
                      value={participantInput}
                      onChange={(event) => setParticipantInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addParticipantField();
                        }
                      }}
                      placeholder="例如：岗位 / 从业年限"
                    />
                    <button
                      className="admin-button admin-button--secondary"
                      type="button"
                      onClick={addParticipantField}
                      disabled={!participantInput.trim()}
                    >
                      添加
                    </button>
                  </div>
                  <div className="admin-chip-list" aria-label="参与者需要填写的信息">
                    {form.participantFields.map((field) => (
                      <span className="admin-chip" key={field}>
                        {field}
                        <button
                          type="button"
                          aria-label={`移除参与者信息 ${field}`}
                          onClick={() => update("participantFields", form.participantFields.filter((item) => item !== field))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {errors.participantFields ? <p className="admin-field-error">{errors.participantFields}</p> : null}
                </fieldset>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="admin-form-section">
                <div className="admin-field">
                  <label htmlFor="challenge-rule">模拟案例生成</label>
                  <p className="admin-field__hint">一句话描述当前调研主题下，希望给参与者呈现什么案例；如涉及数据指标，请列出具体指标，系统会据此模拟不同组合下的案例。</p>
                  <textarea
                    id="challenge-rule"
                    className="admin-textarea admin-textarea--prompt"
                    value={form.challengeRule}
                    aria-invalid={Boolean(errors.challengeRule)}
                    onChange={(event) => update("challengeRule", event.target.value)}
                    placeholder="例：成熟合作网点近三个月续保率下降，报价率稳定、报价成交率下降，同时竞品增加驻店活动。"
                  />
                  {errors.challengeRule ? <p className="admin-field-error">{errors.challengeRule}</p> : null}
                </div>

                <fieldset className="admin-fieldset">
                  <legend>核心萃取维度</legend>
                  <p>让 AI 按你勾选的维度问问题。</p>
                  <div className="admin-dimension-grid">
                    {DIMENSIONS.map((dimension) => (
                      <label className="admin-checkbox" key={dimension.name}>
                        <input
                          type="checkbox"
                          checked={form.dimensions.includes(dimension.name)}
                          onChange={() => update("dimensions", toggleItem(form.dimensions, dimension.name))}
                        />
                        <span>
                          <strong>{dimension.name}</strong>
                          <small>{dimension.note}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.dimensions ? <p className="admin-field-error">{errors.dimensions}</p> : null}
                </fieldset>

                <fieldset className="admin-fieldset">
                  <legend>参与者案例策略</legend>
                  <div className="admin-grid admin-grid--2">
                    <label className="admin-radio">
                      <input
                        type="radio"
                        name="case-mode"
                        checked={form.caseMode === "fixed"}
                        onChange={() => update("caseMode", "fixed")}
                      />
                      <span>
                        <strong>全员使用同一案例</strong>
                        <small>便于比较不同业务员的判断差异，适合首版经验萃取。</small>
                      </span>
                    </label>
                    <label className="admin-radio">
                      <input
                        type="radio"
                        name="case-mode"
                        checked={form.caseMode === "variant"}
                        onChange={() => update("caseMode", "variant")}
                      />
                      <span>
                        <strong>按规则生成案例变体</strong>
                        <small>扩大经验覆盖，但不同回答之间的可比性会降低。</small>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <div className="admin-field">
                  <label htmlFor="scenario-keyword">业务热词 <span className="admin-field__optional">选填</span></label>
                  <p className="admin-field__hint">如专业术语、指标名称。当前会随配置保存，后续可用于优化语音转写与追问。</p>
                  <div className="admin-inline-field">
                    <input
                      id="scenario-keyword"
                      className="admin-input"
                      value={keywordInput}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addKeyword();
                        }
                      }}
                      placeholder="输入热词后回车"
                    />
                    <button
                      className="admin-button admin-button--secondary"
                      type="button"
                      onClick={addKeyword}
                      disabled={!keywordInput.trim()}
                    >
                      添加
                    </button>
                  </div>
                  <div className="admin-chip-list" aria-label="已添加热词">
                    {form.keywords.map((keyword) => (
                      <span className="admin-chip" key={keyword}>
                        {keyword}
                        <button
                          type="button"
                          aria-label={`移除热词 ${keyword}`}
                          onClick={() => update("keywords", form.keywords.filter((item) => item !== keyword))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="admin-form-section">
                <div className="admin-publish-preview">
                  <div className="admin-publish-preview__copy">
                    <p className="admin-kicker">业务员参与入口</p>
                    <h3>发布后生成</h3>
                    <p>保存任务后会生成独立邀请码；受控免登录链接可在任务详情中创建并仅显示一次。</p>
                  </div>
                  <div className="admin-publish-preview__shape" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>

                <fieldset className="admin-fieldset">
                  <legend>保存方式</legend>
                  <div className="admin-grid admin-grid--2">
                    <label className="admin-radio">
                      <input
                        type="radio"
                        name="publish-status"
                        checked={form.status === "published"}
                        onChange={() => update("status", "published")}
                      />
                      <span>
                        <strong>保存并发布</strong>
                        <small>任务会写入机构数据库，并开放受控参与入口。</small>
                      </span>
                    </label>
                    <label className="admin-radio">
                      <input
                        type="radio"
                        name="publish-status"
                        checked={form.status === "draft"}
                        onChange={() => update("status", "draft")}
                      />
                      <span>
                        <strong>保存为任务草稿</strong>
                        <small>任务草稿会写入机构数据库，暂不开放参与入口。</small>
                      </span>
                    </label>
                  </div>
                </fieldset>
              </div>
            ) : null}
          </div>

          <footer className="admin-wizard-form__footer">
            <button
              className="admin-button admin-button--secondary"
              type="button"
              onClick={previousStep}
              disabled={step === 1}
            >
              上一步
            </button>
            <button className="admin-button admin-button--primary" type="submit" disabled={publishing}>
              {publishing
                ? "正在保存…"
                : step < STEPS.length
                  ? "继续下一步"
                  : form.status === "published"
                    ? "保存并发布"
                    : "保存任务草稿"}
              {!publishing ? <span aria-hidden="true">→</span> : null}
            </button>
          </footer>
        </form>
      </div>

      {toast ? (
        <div className="admin-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
