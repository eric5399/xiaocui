export type ScenarioStatus = "published" | "draft" | "closed";

export type Scenario = {
  id: string;
  name: string;
  topic: string;
  background: string;
  objective: string;
  target: string;
  duration: string;
  status: ScenarioStatus;
  interviews: number;
  completed: number;
  rules: number;
  updatedAt: string;
  prompt: string;
  keywords: string[];
  challengeRule: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "renewal-diagnosis",
    name: "网点续保异常诊断经验萃取",
    topic: "车代经营",
    background:
      "近期部分成熟合作网点的续保成交率出现波动，希望还原优秀业务人员识别异常、验证原因与选择经营动作的思考过程。",
    objective:
      "萃取异常信号、归因逻辑、动作选择、效果反馈与方法边界。",
    target: "优秀车代业务员",
    duration: "15–20 分钟",
    status: "published",
    interviews: 8,
    completed: 6,
    rules: 4,
    updatedAt: "今日 09:42",
    prompt:
      "你是一名保险销售经验萃取专家。你需要围绕用户的判断依据、行动原因和边界条件追问，不提供业务答案，不虚构用户未提及的事实。",
    keywords: ["续保率", "报价率", "成交率", "驻店", "竞品"],
    challengeRule:
      "生成一个合作 2 年以上的成熟网点，保持报价率稳定，让续保率和成交率出现可识别的异常。",
  },
  {
    id: "family-protection",
    name: "高净值客户家庭保障沟通复盘",
    topic: "客户经营",
    background:
      "沉淀资深顾问如何在信息不完整时识别家庭保障缺口，并建立不冒进的沟通顺序。",
    objective: "萃取需求探询、异议判断与沟通节奏的可复用规则。",
    target: "高级客户经理",
    duration: "18–22 分钟",
    status: "published",
    interviews: 7,
    completed: 5,
    rules: 3,
    updatedAt: "昨日 16:10",
    prompt:
      "你是一名客户经营经验访谈官。优先追问用户看到的具体信号，再追问其选择沟通顺序的原因。",
    keywords: ["家庭责任", "现金流", "保障缺口", "异议"],
    challengeRule:
      "生成一个已配置基础保障、但家庭责任发生变化的客户情境。",
  },
  {
    id: "objection-review",
    name: "新人成交异议处理经验征集",
    topic: "销售转化",
    background:
      "为新人训练营准备可复盘的异议处理案例，先向资深业务人员征集经验。",
    objective: "识别异议类型、应对顺序与不宜使用的表达。",
    target: "资深业务员",
    duration: "12–15 分钟",
    status: "draft",
    interviews: 0,
    completed: 0,
    rules: 0,
    updatedAt: "8 月18日",
    prompt:
      "你是一名销售复盘访谈官，需要将笼统的经验追问为可验证的事实和选择依据。",
    keywords: ["价格异议", "信任", "犹豫", "跟进"],
    challengeRule: "生成一个客户在决策后期提出价格异议的场景。",
  },
];

export const INTERVIEW = {
  id: "iv-202608-018",
  scenarioId: "renewal-diagnosis",
  participant: "周妍",
  initials: "ZY",
  organization: "华东分公司 · 车代渠道",
  role: "高级客户经理",
  submittedAt: "2026-08-20 09:31",
  duration: "18分42秒",
  turns: 9,
  source: "文字输入",
  challenge: {
    title: "成熟 4S 网点续保转化下滑",
    facts: [
      "合作 3 年，续保率从 72% 下降至 58%",
      "报价率稳定，报价成交率下降 15%",
      "竞品近期增加驻店活动",
    ],
  },
  transcript: [
    {
      role: "agent" as const,
      label: "小萃",
      time: "09:12",
      text: "如果你负责这个网点，你会先如何判断问题？",
    },
    {
      role: "user" as const,
      label: "周妍",
      time: "09:14",
      text: "报价率没掉，但成交率掉了，我不会先判定是客源减少。我会先查报价后的跟进和门店推荐情况，竞品只是候选原因。",
    },
    {
      role: "agent" as const,
      label: "小萃",
      time: "09:15",
      text: "你会用哪些信息来区分“跟进变弱”和“竞品分流”？",
    },
    {
      role: "user" as const,
      label: "周妍",
      time: "09:18",
      text: "我会抽最近两周未成交清单，看报价到首次回访的间隔，再按销售顾问分组。如果集中在个别人，先处理跟进；如果普遍下降且客户提到赠品，再查竞品。",
    },
    {
      role: "agent" as const,
      label: "小萃",
      time: "09:20",
      text: "验证后，你会选择什么动作？为什么先做这个？",
    },
    {
      role: "user" as const,
      label: "周妍",
      time: "09:24",
      text: "先和店内对齐 24 小时回访节点，用三天看数据，不一上来就做促销。这个动作成本低，也能帮我们排除内部执行问题。",
    },
    {
      role: "agent" as const,
      label: "小萃",
      time: "09:26",
      text: "这套方法在什么情况下不适用？",
    },
    {
      role: "user" as const,
      label: "周妍",
      time: "09:29",
      text: "如果报价率也同时下降，就不能只盯跟进，要先看客源、门店推荐和报价触达。另外样本太少时不能立即下结论。",
    },
  ],
  coverage: [
    { label: "机会发现", value: 92 },
    { label: "判断逻辑", value: 96 },
    { label: "行动策略", value: 88 },
    { label: "效果反馈", value: 68 },
    { label: "边界条件", value: 90 },
  ],
  extractedCase: {
    title: "用报价后回访分布定位续保转化下滑",
    discovery:
      "报价率稳定、但成交率下降，说明客源不是首要假设，问题更可能发生在报价之后。",
    judgement:
      "抽取近两周未成交清单，检查报价至首次回访的时间间隔，并按销售顾问分组，区分个人执行与外部分流。",
    action:
      "先对齐 24 小时回访节点，运行三天小范围验证；内部执行无改善时，再核对竞品活动与客户反馈。",
    result:
      "本次访谈未提供具体结果数值，仅能保留为待验证经验。",
  },
  rule: {
    title: "先根据漏斗断点定位，再分组验证异常",
    condition: "报价率稳定、报价成交率显著下降的成熟合作网点。",
    judgement: "按人员分组检查报价后回访间隔，判断异常是否集中。",
    strategy: "先用 3 天窗口统一 24 小时回访，再根据变化决定是否进入竞品应对。",
    limitation: "报价率同步下降或样本过少时不适用。",
  },
};

export const FUSION_CANDIDATES = [
  {
    id: "rule-01",
    source: "周妍 · 访谈 018",
    selected: true,
    evidence: "4/5 维度",
    title: "先按漏斗断点定位，再检查个人执行差异",
    detail:
      "报价率稳定时，优先检查报价后回访，不先归因于客源。",
  },
  {
    id: "rule-02",
    source: "陈一帆 · 访谈 014",
    selected: true,
    evidence: "5/5 维度",
    title: "小样本验证内部动作，再进入资源投放",
    detail:
      "用 3–5 天固定回访节点，将可控的内部因素与竞品影响分开。",
  },
  {
    id: "rule-03",
    source: "王琦 · 访谈 011",
    selected: true,
    evidence: "4/5 维度",
    title: "用客户原话判断竞品影响，不以活动存在替代证据",
    detail:
      "只有当未成交客户反复提到竞品权益时，才将竞品列为主因。",
  },
  {
    id: "rule-04",
    source: "林默 · 访谈 009",
    selected: false,
    evidence: "3/5 维度",
    title: "转化下降时直接增加门店促销支持",
    detail:
      "未提供排除执行问题的依据，与其他候选规则存在冲突。",
  },
];

export function scenarioById(id: string) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}

