import type {
  ChatMessage,
  H5Progress,
  InterviewCoverage,
  InterviewDimension,
} from "./types";

export const DEMO_INVITE_CODE = "XC2026";

export const taskMock = {
  title: "网点续保异常诊断经验萃取",
  topic: "成熟合作网点续保经营",
  objective:
    "了解一线业务人员如何发现续保异常、判断原因并选择经营动作。",
} as const;

export const challengeMock = {
  label: "演示挑战案例",
  title: "成熟 4S 店续保成交转弱",
  description:
    "某 4S 店与公司合作 3 年。最近三个月，续保率由 72% 降至 58%，报价率基本稳定，报价成交率下降 15%。同期，竞品增加了驻店活动。",
  question:
    "如果由你负责该网点，你会先判断什么？会查看哪些信息？",
  metrics: [
    { label: "合作年限", value: "3 年", note: "成熟网点" },
    { label: "续保率", value: "72% → 58%", note: "近三个月" },
    { label: "报价率", value: "基本稳定", note: "流量无明显异常" },
    { label: "报价成交率", value: "下降 15%", note: "转化承压" },
  ],
  event: "竞品近期增加驻店活动",
} as const;

export const dimensions: ReadonlyArray<{
  id: InterviewDimension;
  label: string;
  shortLabel: string;
}> = [
  { id: "discovery", label: "机会发现", shortLabel: "发现" },
  { id: "judgement", label: "判断逻辑", shortLabel: "判断" },
  { id: "action", label: "动作选择", shortLabel: "动作" },
  { id: "result", label: "效果反馈", shortLabel: "效果" },
  { id: "boundary", label: "边界条件", shortLabel: "边界" },
];

export const emptyCoverage: InterviewCoverage = {
  discovery: 0,
  judgement: 0,
  action: 0,
  result: 0,
  boundary: 0,
};

export const initialAgentMessage: ChatMessage = {
  id: "agent-opening",
  role: "agent",
  target: "judgement",
  createdAt: "",
  content:
    "请先说说你的初步判断。除了竞品活动，你还会优先排查哪些因素？",
};

const promptByDimension: Record<
  InterviewDimension,
  { missing: string; partial: string }
> = {
  discovery: {
    missing:
      "回到问题最初，你通常会从哪个信号发现这类异常？是看数据，还是来自网点的现场反馈？",
    partial:
      "你提到了异常信号。能再具体一些吗：多长时间的变化会让你认为需要介入？",
  },
  judgement: {
    missing:
      "你会如何区分是客户流量、销售推荐，还是竞品导致的问题？",
    partial:
      "你刚才给出了一个判断。哪些数据或现场信息能够验证它？也请说说你排除的另一种可能。",
  },
  action: {
    missing:
      "如果完成验证后证明成交环节确实转弱，你会采取的第一个动作是什么？",
    partial:
      "为什么先做这个动作，而不是立即做价格或激励调整？请说说执行顺序。",
  },
  result: {
    missing:
      "你会用什么结果来判断动作有效？多久复盘一次？",
    partial:
      "除了续保率，还有哪个过程指标能更早地证明方法正在起效？",
  },
  boundary: {
    missing:
      "这套方法在什么条件下不适用？实际执行中最需要避免的误判是什么？",
    partial:
      "你已经提到了一个边界。如果网点尚未形成稳定客户池，这套方法需要如何调整？",
  },
};

const keywords: Record<InterviewDimension, string[]> = {
  discovery: ["发现", "信号", "指标", "数据", "下降", "趋势", "连续"],
  judgement: ["判断", "因为", "原因", "依据", "排除", "竞品", "推荐"],
  action: ["动作", "沟通", "对比", "访谈", "抽访", "复盘", "调整", "跟进"],
  result: ["结果", "效果", "提升", "恢复", "改善", "转化", "周"],
  boundary: ["不适用", "风险", "前提", "如果", "除非", "避免", "误判", "不能"],
};

export function createInitialProgress(inviteCode: string): H5Progress {
  return {
    version: 1,
    inviteCode,
    privacyAccepted: false,
    status: "new",
    profile: {
      name: "",
      organization: "",
      role: "",
      years: "",
      networkCount: "",
    },
    messages: [],
    coverage: { ...emptyCoverage },
    draft: "",
    lastSavedAt: null,
    completedAt: null,
    apiInterviewId: null,
    apiChallenge: null,
    apiExtractedCase: null,
    apiSyncState: "local",
    apiError: null,
  };
}

export function isDemoInviteCode(value: string) {
  return value.trim().toUpperCase() === DEMO_INVITE_CODE;
}

export function getResumePath(progress: H5Progress) {
  const base = `/t/${encodeURIComponent(progress.inviteCode)}`;
  switch (progress.status) {
    case "profile":
      return `${base}/profile`;
    case "challenge":
      return `${base}/challenge`;
    case "interview":
      return `${base}/interview`;
    case "submitted":
      return `${base}/complete`;
    default:
      return base;
  }
}

function bumpLevel(level: 0 | 1 | 2, increment: number): 0 | 1 | 2 {
  return Math.min(2, level + increment) as 0 | 1 | 2;
}

export function updateCoverage(
  current: InterviewCoverage,
  answer: string,
  target?: InterviewDimension,
) {
  const next = { ...current };
  const normalized = answer.replace(/\s+/g, "");

  if (target) {
    next[target] = bumpLevel(
      next[target],
      normalized.length >= 34 ? 2 : 1,
    );
  }

  dimensions.forEach(({ id }) => {
    const matches = keywords[id].filter((word) => normalized.includes(word));
    if (matches.length >= 2) {
      next[id] = bumpLevel(next[id], 1);
    }
  });

  return next;
}

export function getNextQuestion(coverage: InterviewCoverage) {
  const incomplete = dimensions.find(({ id }) => coverage[id] < 2);
  if (!incomplete) {
    return {
      target: "boundary" as const,
      content:
        "这次复盘的五个方面已经基本覆盖。请用一句话总结：面对这类网点，你最想提醒同事不要跳过哪一步？",
    };
  }

  const level = coverage[incomplete.id];
  return {
    target: incomplete.id,
    content:
      level === 0
        ? promptByDimension[incomplete.id].missing
        : promptByDimension[incomplete.id].partial,
  };
}

export const transcriptMock =
  "我会先按销售顾问对比近三个月的报价量、推荐记录和成交率，再抽访未成交客户，验证是推荐动作还是竞品影响。";

export const personalSummaryMock = {
  title: "成熟网点续保转化下降的分层诊断法",
  scene:
    "适用于合作 2 年以上、报价率稳定但报价成交率持续下降的 4S 店。",
  judgement:
    "先区分客户流量、报价、销售推荐和竞品影响，不因单一事件直接归因。",
  action:
    "按销售顾问拆分漏斗数据，复核未成交原因，再决定店总沟通或联合经营动作。",
  risk:
    "缺少客户反馈和人员维度数据时，不应将问题完全归因于竞品。",
} as const;
