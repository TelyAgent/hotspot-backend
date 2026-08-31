# Signal Evidence Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Signal 进入事件/机会挖掘前补齐可解释证据，避免系统只凭热搜词、视频标题或日程标题生成虚假的事件概要。

**Architecture:** 新增统一的 `Signal Evidence Enrichment` 层，位于 `Signal/Evidence` 写入之后、`Opportunity Mining / Topic Watch Trigger` 之前。补全层按 `signalType` 选择策略：X 热搜补相关帖子，主题圈补代表帖和账号讨论上下文，YouTube 补视频元信息和已有拆解，未来事件补官方来源、时间窗口和监控信号。事件形成 Agent 只消费补全后的证据包和证据质量结论，并为 Event 生成固定领域标签。

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, TypeScript, 现有 Data Source Plugin, 现有 Agent Tool Registry, 现有 OpenAI/LangGraph Agent Workflow Engine。

**Spec:** `/Users/qmk/work/hotspot-monitor/hotspot-agent-backend/docs/hotspot-agent/SYSTEM_ARCHITECTURE_V2.md`、`/Users/qmk/work/hotspot-monitor/hotspot-agent-backend/docs/hotspot-agent/OPPORTUNITY_MINING_AGENT_WORKFLOW_ARCHITECTURE.md`、`/Users/qmk/work/hotspot-monitor/hotspot-agent-backend/docs/hotspot-agent/TOPIC_WATCH_AGENT_ARCHITECTURE.md`

## Global Constraints

- 文档、错误提示和运营可见文案使用中文。
- 不能把平台热度、关键词或单条标题直接包装成已确认事实。
- 事件标题必须来自证据中的主体、动作、对象和时间；证据不足时使用保守标题。
- 补全失败不能阻断采集写入，但必须写入 `missingData` 或证据质量结论。
- YouTube 字幕拆解保持手动触发；补全层只能复用已有拆解结果，不自动拆解。
- 未来事件不能被包装成“已发生热点”；只能形成未来事件、预热机会或监控信号。
- 所有补全证据必须保存为 `evidence_items`，并保留可打开链接或明确说明来源不可打开。
- 不新增独立任务分发业务；补全结果服务于 Event / Opportunity / 热点运营工作区。
- 所有运营可见的描述、摘要、结论、缺失数据、风险说明、证据摘要、事件标题建议必须统一输出中文；专有名词、平台名、账号名、标签 code 可保留英文。
- Event 必须写入固定领域标签，标签放入现有 `events.labels` JSON 中，`category = domain`。
- 领域标签只能从固定集合中选择：`AI`、`Technology`、`Politics & Elections`、`Geopolitics & Conflict`、`Macro & Financial Markets`、`Crypto & Web3`、`Prediction Markets`、`Official Schedule`。
- 一个 Event 可以有多个领域标签，但至少要有一个；无法判断时使用最保守的来源相关领域，例如官方日程使用 `Official Schedule`。

---

## 1. 目标问题

当前事件卡片出现类似 `아가미 무대인사热搜事件` 的标题，根因不是前端展示问题，而是源头证据不足：

- X 热搜 Signal 只有热搜词、地区、排名和搜索链接。
- 主题圈候选有代表 Signal，但触发 Event 时没有统一证据质量判断。
- YouTube 视频有标题和指标，但没有字幕拆解时不能解释“为什么火”。
- 未来事件有官方日程，但它是未来对象，不应该被当成普通已发生热点。
- Opportunity Mining Agent 虽然可以调用工具，但没有一个确定的“证据补全完成 / 证据不足”输入。

因此需要新增统一证据补全层，让事件形成前先回答：

1. 当前 Signal 能否解释“发生了什么”？
2. 是否有可打开来源？
3. 是否能提取主体、动作、对象、时间？
4. 如果不能，应该如何保守命名和记录缺失数据？

## 2. 目标链路

```text
Data Source Plugin
→ RawItem
→ Signal
→ 基础 Evidence
→ Signal Evidence Enrichment
→ Evidence Quality Gate
→ Opportunity Mining / Topic Watch Trigger
→ Event / Opportunity
```

补全层不直接决定是否创建事件。它只产出证据包和质量结论。

## 3. 文件结构

### 新增文件

- `src/signal/enrichment/signal-evidence-enrichment.module.ts`
  组装补全层 providers，并从 `SignalModule` 或 `AppModule` 暴露。

- `src/signal/enrichment/signal-evidence-enrichment.service.ts`
  统一入口。根据 Signal 类型调用对应策略，返回补全结果。

- `src/signal/enrichment/signal-evidence-enrichment.types.ts`
  定义补全输入、输出、证据质量等级和保守标题结构。

- `src/signal/enrichment/strategies/x-trend-evidence-enricher.ts`
  X 热搜补全策略。读取热搜 Signal、diff、相关 X 搜索帖子，沉淀解释热搜原因的 Evidence。

- `src/signal/enrichment/strategies/topic-candidate-evidence-enricher.ts`
  主题圈补全策略。读取候选话题代表 Signal、帖子 Evidence、账号信息和互动指标。

- `src/signal/enrichment/strategies/youtube-video-evidence-enricher.ts`
  YouTube 补全策略。读取视频基础 Evidence 和已有 `youtube_video_analyses`。

- `src/signal/enrichment/strategies/future-event-evidence-enricher.ts`
  未来事件补全策略。读取官方日程 Evidence、FutureEvent/FutureEventCandidate 和监控计划结果。

- `src/signal/enrichment/evidence-quality-gate.service.ts`
  根据补全结果输出证据质量结论、缺失数据和保守标题建议。

- `src/opportunity/labeling/event-domain-label.service.ts`
  根据 Signal、Evidence、TopicWatch、FutureEvent 和 Agent 输出，为 Event 生成固定领域标签。

- `test/unit/signal/enrichment/*.spec.ts`
  覆盖统一入口、各来源策略和质量门槛。

- `test/unit/opportunity/labeling/event-domain-label.service.spec.ts`
  覆盖固定领域标签映射和多领域输出。

### 修改文件

- `src/signal/signal.module.ts`
  导出补全层服务。

- `src/opportunity/mining/opportunity-mining-evidence.service.ts`
  加载基础 Evidence 后调用补全层，返回补全后的 Evidence 和 `qualityGate`。

- `src/opportunity/mining/opportunity-mining-agent.service.ts`
  将 `qualityGate` 放入 `evidenceMemory`，供 Agent 判断标题和置信度。

- `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`
  持久化决策前校验：证据不足时不能保存高置信度 `create_event`；保存 Event 时合并来源标签、触发标签和领域标签。

- `src/topic-watch/trigger/topic-watch-trigger.service.ts`
  主题候选触发 Event 前调用主题候选补全，不再只用 candidate title/summary 直接创建 Event。

- `src/agent/tools/core-agent-tools.service.ts`
  补充只读工具，供 Agent 按需查询补全后的证据和证据质量。

- `src/agent/model-provider/openai-model-provider.ts`
  更新 Agent 输出契约，要求所有运营可见文本统一中文，并要求 Event/Opportunity 判断给出固定领域标签建议。

- `docs/runtime/opportunity-mining/global-principles.md`
  明确证据质量门槛、中文输出约束和固定领域标签集合。

- `docs/runtime/opportunity-mining/x-trend-rules.md`
  明确只有热搜词时的保守输出规则。

- `docs/runtime/opportunity-mining/youtube-video-rules.md`
  明确无字幕拆解时不得解释“为什么火”。

- `docs/runtime/opportunity-mining/future-event-rules.md`
  明确未来事件不等同于已发生热点。

## 4. 核心接口

### 4.1 补全输入

```ts
export interface EnrichSignalEvidenceInput {
  signalId: string;
  signalType?: string;
  sourceContext?: Record<string, unknown>;
  mode: 'before_opportunity_mining' | 'before_topic_trigger' | 'manual_refresh';
  maxEvidence?: number;
}
```

### 4.2 补全输出

```ts
export interface EnrichedEvidencePackage {
  signalId: string;
  signalType: string;
  evidenceRefs: string[];
  evidenceItems: Array<{
    id: string;
    sourceType: string;
    claim: string;
    text?: string | null;
    url?: string | null;
    author?: string | null;
    publishedAt?: Date | null;
    observedAt: Date;
    confidence: string;
  }>;
  qualityGate: EvidenceQualityGateResult;
  conservativeTitle?: string;
  domainLabels: EventDomainLabel[];
  enrichmentSummary: string;
}
```

### 4.3 证据质量结论

```ts
export interface EvidenceQualityGateResult {
  level: 'strong' | 'usable' | 'thin' | 'insufficient';
  canCreateEvent: boolean;
  canUseHighConfidence: boolean;
  hasOpenableSource: boolean;
  hasReasonEvidence: boolean;
  hasActorActionObject: boolean;
  missingData: string[];
  riskNotes: string[];
}
```

### 4.4 固定领域标签

领域标签用于后续事件列表筛选、运营看板统计和热点运营入口分组。领域标签是 Event 的业务属性，不是来源标签，也不是触发标签。

```ts
export type EventDomainCode =
  | 'AI'
  | 'Technology'
  | 'Politics & Elections'
  | 'Geopolitics & Conflict'
  | 'Macro & Financial Markets'
  | 'Crypto & Web3'
  | 'Prediction Markets'
  | 'Official Schedule';

export interface EventDomainLabel {
  code: EventDomainCode;
  name: EventDomainCode;
  category: 'domain';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceRefs: string[];
}
```

写入 `events.labels` 时和现有标签结构保持一致：

```json
{
  "code": "Prediction Markets",
  "name": "Prediction Markets",
  "category": "domain",
  "reason": "证据文本和主题配置指向预测市场行业。",
  "confidence": "high",
  "evidenceRefs": ["ev_1"]
}
```

## 5. 中文输出约束

所有会被运营人员看到或被内容生成继续消费的自然语言字段必须是中文。

必须中文化的字段：

- `Event.title`
- `Event.summary`
- `Event.missingData`
- `Event.riskNotes`
- `Event.sourceSummary`
- `Event.identity.coreFact`
- `Opportunity.title`
- `Opportunity.summary`
- `Opportunity.whyNow`
- `Opportunity.whyItMatters`
- `Opportunity.productAngles`
- `EvidenceItem.claim`
- `EnrichedEvidencePackage.enrichmentSummary`
- `EvidenceQualityGateResult.missingData`
- `EvidenceQualityGateResult.riskNotes`
- Agent 输出中的 `message`、`summary`、`whyNow`、`whyItMatters`、`riskNotes`、`missingData`、`suggestedNextSteps`

允许保留英文的内容：

- 平台名：`X`、`YouTube`
- 账号名：`@OpenAI`
- 产品名和机构名：`Polymarket`、`OpenAI`、`FOMC`
- 固定领域标签 code：`Prediction Markets`
- 技术字段名：`signalType`、`evidenceRefs`

如果来源文本是非中文，系统不需要逐字翻译原文 Evidence `text`，但 `claim`、摘要、结论和事件标题必须用中文说明。

## 6. 领域标签策略

### 6.1 标签集合

固定领域：

| code | 说明 |
| --- | --- |
| `AI` | AI 模型、Agent、算力、芯片、AI 产品和 AI 公司事件。 |
| `Technology` | 非 AI 的科技产品、互联网平台、硬件、软件、网络安全和开发者生态。 |
| `Politics & Elections` | 选举、候选人、政党、民调、政策、国会、政府人事和国内政治。 |
| `Geopolitics & Conflict` | 国际冲突、战争、外交、制裁、地缘政治风险和跨国安全事件。 |
| `Macro & Financial Markets` | 宏观经济、央行、通胀、就业、GDP、利率、债券、股票、外汇、大宗商品。 |
| `Crypto & Web3` | 加密资产、交易所、稳定币、DeFi、链上安全、钱包、ETF、监管。 |
| `Prediction Markets` | Polymarket、Kalshi、预测市场、概率异动、结算争议、预言机和相关监管。 |
| `Official Schedule` | 官方日程、未来事件、经济数据发布日期、FOMC 会议、政府发布日历。 |

### 6.2 判定优先级

1. 如果来源是未来事件官方日程，至少打 `Official Schedule`。
2. 如果关联 TopicWatch 的 `domains` 或 `name` 命中固定领域，优先使用主题配置。
3. 如果 Evidence 来自 X 帖子、YouTube 标题或热搜相关帖子，根据文本关键词和 Agent 输出判定。
4. 如果一个事件同时属于多个领域，可以打多个标签，例如 `Official Schedule` + `Macro & Financial Markets`。
5. 如果只知道来源但不知道领域，使用来源最保守标签；仍无法判断时不创建高置信 Event。

### 6.3 推荐映射

```ts
const EVENT_DOMAIN_KEYWORDS = {
  AI: ['AI', 'artificial intelligence', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'GPT', 'Gemini', 'NVIDIA', 'GPU', '大模型', '人工智能', '芯片', '算力'],
  Technology: ['technology', 'software', 'hardware', 'cybersecurity', 'developer', 'API', 'app', '平台', '软件', '硬件', '网络安全'],
  'Politics & Elections': ['election', 'campaign', 'candidate', 'poll', 'vote', 'senate', 'congress', 'president', '选举', '候选人', '民调', '国会', '总统'],
  'Geopolitics & Conflict': ['war', 'conflict', 'ceasefire', 'sanction', 'military', 'Russia', 'Ukraine', 'Israel', '外交', '制裁', '战争', '冲突'],
  'Macro & Financial Markets': ['CPI', 'PCE', 'jobs report', 'FOMC', 'Fed', 'rate cut', 'inflation', 'GDP', 'Treasury', '通胀', '非农', '美联储', '降息', '加息'],
  'Crypto & Web3': ['Bitcoin', 'BTC', 'Ethereum', 'ETH', 'Solana', 'stablecoin', 'DeFi', 'Binance', 'Coinbase', '加密', '稳定币', '链上'],
  'Prediction Markets': ['Polymarket', 'Kalshi', 'PredictIt', 'Metaculus', 'prediction market', 'odds', 'probability', '预测市场', '概率', '赔率'],
  'Official Schedule': ['official schedule', 'calendar', 'release calendar', 'FOMC meeting', 'BEA', 'BLS', '官方日程', '发布日历'],
} as const;
```

## 7. 各来源补全策略

### 7.1 X 热搜

输入：`signalType = x_trend`

基础证据：

- 热搜词。
- 地区。
- 排名。
- 观察时间。
- X 搜索链接。

补充证据：

- 调用现有或新增 X 搜索能力，按 query 搜索近期相关帖子。
- 优先保留原帖、官方账号、媒体账号、高互动帖子。
- 保存每条帖子为 Evidence：
  - `sourceType = x_trend_related_post`
  - `sourceItemId = postId`
  - `claim = "${作者} 发布了与热搜 ${query} 相关的帖子。"`
  - `text = 帖子正文`
  - `url = 帖子链接`
  - `metrics = likes/reposts/replies/quotes/views`

质量规则：

- 找到至少 1 条相关帖子：`hasReasonEvidence = true`。
- 找到至少 2 条不同作者相关帖子：`level` 至少为 `usable`。
- 只有榜单 Evidence：`level = thin`，`canCreateEvent = false`，保守标题为 `${region} X 热搜：${title}`。

领域标签：

- 热搜相关帖子命中固定领域关键词时，写入对应领域标签。
- 命中重点主题时，优先继承 TopicWatch 对应领域。
- 仅有热搜词且无法判断领域时，不应高置信创建事件。

### 7.2 主题圈

输入：`TopicCandidate` 或 `signalType = x_post`

基础证据：

- 代表帖子 Signal。
- 主题配置。
- 候选话题指标：`B3h`、`B24h`、`Tmax`、账号数、帖子数。

补充证据：

- 根据 `representativeSignalIds` 读取帖子 Evidence。
- 如果 candidate 没有 `evidenceRefs`，从代表 Signal 回填真实 Evidence。
- 汇总参与账号、代表帖子链接、正文、发布时间、互动指标。
- 生成候选话题证据摘要：
  - 哪些账号在讨论。
  - 讨论是否指向同一事实。
  - 当前触发了哪些主题规则。

质量规则：

- 至少 2 个账号或 2 条独立帖子指向同一事实：`level = usable`。
- 只有 1 条帖子：`level = thin`，可以形成候选，但不应高置信创建事件。
- 如果多个帖子只是关键词相似但事实不同：`canCreateEvent = false`。

领域标签：

- 优先从 TopicWatch 配置的 `domains` 推导固定领域。
- 其次从代表帖子正文和作者角色推导领域。
- 多个主题共同指向同一事件时，可以保留多个领域标签。

### 7.3 YouTube

输入：`signalType = youtube_video`

基础证据：

- 视频标题。
- 频道。
- 发布时间。
- 播放量、点赞数、评论数。
- 封面。
- 视频链接。

补充证据：

- 读取最新 `youtube_video_analyses`。
- 如果分析状态为 `succeeded`，将拆解结果写入 Evidence：
  - `sourceType = youtube_transcript_analysis`
  - `claim = "视频字幕拆解完成，可解释内容结构。"`
  - `text = 中文拆解摘要`
  - `url = 视频链接`
- 如果无拆解或拆解失败，不自动触发拆解，只写入缺失数据：
  - `缺少字幕拆解，暂不能解释视频为什么火。`

质量规则：

- 有视频元信息但无拆解：`level = thin` 或 `usable`，取决于指标完整度；不能输出“为什么火”的强结论。
- 有字幕拆解：`level = strong`，可以用于内容复刻和运营角度。

领域标签：

- 有拆解结果时，从中文拆解摘要、视频标题、频道和关键词推导领域。
- 没有拆解结果时，只能基于标题、频道和采集标签打低置信领域标签。

### 7.4 未来事件

输入：`signalType = future_event`

基础证据：

- 官方来源。
- 官方链接。
- 日程标题。
- 计划发生时间。
- 事件类型。
- 来源机构。

补充证据：

- 查询 `future_events`、`future_event_candidates` 和监控计划。
- 汇总监控窗口、预热窗口、需要关注的平台和关键词。
- 如果已有监控执行产生 Signal，追加为 Evidence：
  - X 搜索结果。
  - X 账号帖子。
  - YouTube 视频。
  - 后续官方更新。

质量规则：

- 官方日程本身是强来源，但它证明的是“未来将发生”，不是“当前已经成为热点”。
- 没有后续讨论 Signal 时，只能形成未来事件或预热机会。
- 有监控 Signal 且讨论升温时，才可进入普通热点机会判断。

领域标签：

- 官方日程必须打 `Official Schedule`。
- BEA、BLS、FOMC 等经济日程同时打 `Macro & Financial Markets`。
- 选举日程同时打 `Politics & Elections`。
- 如果未来事件监控计划指向 YouTube、X 或搜索结果，再根据后续 Signal 追加领域标签。

## 8. 事件标题策略

新增统一标题建议：

```ts
export interface EventTitleSuggestion {
  mode: 'specific_event' | 'source_signal' | 'future_event' | 'insufficient';
  title: string;
  reason: string;
}
```

规则：

- `specific_event`：证据中能提取主体、动作、对象和时间，使用事件概要标题。
- `source_signal`：只有来源信号，无事实原因，使用保守标题。
- `future_event`：未来事件使用日程/预热标题，不写成已发生热点。
- `insufficient`：证据不足，不创建事件。

示例：

```text
错误：아가미 무대인사热搜事件
正确：Korea X 热搜：아가미 무대인사
补证据后：电影《아가미》舞台问候活动引发韩国 X 讨论
```

## 9. Task 1: 定义补全层类型和质量门槛

**Files:**
- Create: `src/signal/enrichment/signal-evidence-enrichment.types.ts`
- Create: `src/signal/enrichment/evidence-quality-gate.service.ts`
- Test: `test/unit/signal/enrichment/evidence-quality-gate.service.spec.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `EvidenceQualityGateService.evaluate(input): EvidenceQualityGateResult`

- [ ] **Step 1: Write the failing test**

```ts
import { EvidenceQualityGateService } from '../../../../src/signal/enrichment/evidence-quality-gate.service';

describe('EvidenceQualityGateService', () => {
  it('marks x trend keyword-only evidence as thin and not event-ready', () => {
    const service = new EvidenceQualityGateService();

    const result = service.evaluate({
      signalType: 'x_trend',
      evidenceItems: [
        {
          id: 'ev_1',
          sourceType: 'x_trend',
          claim: '아가미 무대인사 出现在 Korea X 热榜。',
          text: '아가미 무대인사',
          url: 'https://x.com/search?q=test',
          confidence: 'medium',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        level: 'thin',
        canCreateEvent: false,
        canUseHighConfidence: false,
        hasOpenableSource: true,
        hasReasonEvidence: false,
      }),
    );
    expect(result.missingData).toContain('缺少解释热搜原因的相关帖子或外部来源。');
  });

  it('marks x trend with related posts as usable event evidence', () => {
    const service = new EvidenceQualityGateService();

    const result = service.evaluate({
      signalType: 'x_trend',
      evidenceItems: [
        {
          id: 'ev_1',
          sourceType: 'x_trend',
          claim: 'OpenAI 出现在 United States X 热榜。',
          text: 'OpenAI',
          url: 'https://x.com/search?q=OpenAI',
          confidence: 'medium',
        },
        {
          id: 'ev_2',
          sourceType: 'x_trend_related_post',
          claim: 'OpenAI 官方账号发布 API 更新。',
          text: 'We updated the API.',
          url: 'https://x.com/OpenAI/status/1',
          author: 'OpenAI',
          confidence: 'high',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        level: 'usable',
        canCreateEvent: true,
        hasReasonEvidence: true,
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/evidence-quality-gate.service.spec.ts --runInBand`

Expected: FAIL because `EvidenceQualityGateService` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement these files:

```ts
// src/signal/enrichment/signal-evidence-enrichment.types.ts
export type EvidenceQualityLevel = 'strong' | 'usable' | 'thin' | 'insufficient';

export interface EvidenceQualityGateItem {
  id: string;
  sourceType: string;
  claim: string;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  confidence: string;
}

export interface EvidenceQualityGateInput {
  signalType: string;
  evidenceItems: EvidenceQualityGateItem[];
}

export interface EvidenceQualityGateResult {
  level: EvidenceQualityLevel;
  canCreateEvent: boolean;
  canUseHighConfidence: boolean;
  hasOpenableSource: boolean;
  hasReasonEvidence: boolean;
  hasActorActionObject: boolean;
  missingData: string[];
  riskNotes: string[];
}
```

```ts
// src/signal/enrichment/evidence-quality-gate.service.ts
import { Injectable } from '@nestjs/common';
import {
  EvidenceQualityGateInput,
  EvidenceQualityGateResult,
} from './signal-evidence-enrichment.types';

@Injectable()
export class EvidenceQualityGateService {
  evaluate(input: EvidenceQualityGateInput): EvidenceQualityGateResult {
    const hasOpenableSource = input.evidenceItems.some((item) => Boolean(item.url));
    const hasReasonEvidence = input.evidenceItems.some((item) =>
      ['x_trend_related_post', 'topic_representative_post', 'youtube_transcript_analysis', 'future_event_monitoring_signal'].includes(item.sourceType),
    );
    const hasActorActionObject = input.evidenceItems.some((item) =>
      Boolean(item.author && item.text && item.text.length >= 20),
    );

    if (input.signalType === 'x_trend' && !hasReasonEvidence) {
      return {
        level: 'thin',
        canCreateEvent: false,
        canUseHighConfidence: false,
        hasOpenableSource,
        hasReasonEvidence,
        hasActorActionObject,
        missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
        riskNotes: ['当前只有热搜榜信号，不能直接当成现实事件事实。'],
      };
    }

    return {
      level: hasReasonEvidence ? 'usable' : 'thin',
      canCreateEvent: hasReasonEvidence,
      canUseHighConfidence: hasReasonEvidence && hasActorActionObject,
      hasOpenableSource,
      hasReasonEvidence,
      hasActorActionObject,
      missingData: hasReasonEvidence ? [] : ['缺少解释该信号原因的补充证据。'],
      riskNotes: [],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/signal/enrichment/evidence-quality-gate.service.spec.ts --runInBand`

Expected: PASS.

## 10. Task 2: 实现固定领域标签服务

**Files:**
- Create: `src/opportunity/labeling/event-domain-label.service.ts`
- Modify: `src/opportunity/labeling/event-labeling.service.ts`
- Test: `test/unit/opportunity/labeling/event-domain-label.service.spec.ts`
- Test: `test/unit/opportunity/labeling/event-labeling.service.spec.ts`

**Interfaces:**
- Consumes: `EventDomainCode`、Signal、Evidence、TopicWatch domains、Agent metadata。
- Produces: `EventDomainLabelService.buildDomainLabels(input): EventLabel[]`

- [ ] **Step 1: Write the failing test**

```ts
import { EventDomainLabelService } from '../../../../src/opportunity/labeling/event-domain-label.service';

describe('EventDomainLabelService', () => {
  it('labels prediction market evidence with the fixed domain label', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [
        {
          id: 'ev_1',
          sourceType: 'x_post',
          claim: 'Polymarket 上某预测市场概率出现明显变化。',
          text: 'Polymarket odds moved sharply after the debate.',
          confidence: 'high',
        },
      ],
      topicDomains: [],
      agentSuggestedDomains: [],
    });

    expect(labels).toEqual([
      expect.objectContaining({
        code: 'Prediction Markets',
        name: 'Prediction Markets',
        category: 'domain',
        evidenceRefs: ['ev_1'],
      }),
    ]);
  });

  it('labels official economic schedules with official schedule and macro markets', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [
        {
          id: 'ev_1',
          sourceType: 'fomc',
          claim: 'FOMC meeting 已列入官方日程。',
          text: 'FOMC meeting',
          confidence: 'high',
        },
      ],
      topicDomains: [],
      agentSuggestedDomains: [],
    });

    expect(labels.map((label) => label.code)).toEqual([
      'Official Schedule',
      'Macro & Financial Markets',
    ]);
  });

  it('ignores domains outside the fixed set', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [],
      topicDomains: ['Entertainment'],
      agentSuggestedDomains: ['Random Domain'],
    });

    expect(labels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/opportunity/labeling/event-domain-label.service.spec.ts --runInBand`

Expected: FAIL because `EventDomainLabelService` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

```ts
export const EVENT_DOMAIN_CODES = [
  'AI',
  'Technology',
  'Politics & Elections',
  'Geopolitics & Conflict',
  'Macro & Financial Markets',
  'Crypto & Web3',
  'Prediction Markets',
  'Official Schedule',
] as const;
```

Behavior:

- Only emit labels whose code is in `EVENT_DOMAIN_CODES`.
- `sourceType` in `fomc/bea/bls/opm/future_event_official_schedule` emits `Official Schedule`。
- `fomc/bea/bls` also emits `Macro & Financial Markets`。
- TopicWatch domains and Agent suggested domains are normalized into the fixed set.
- Evidence text and claim use keyword matching as fallback.
- Labels use `category = 'domain'` and `name = code`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/opportunity/labeling/event-domain-label.service.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Integrate with existing event labels**

Modify `EventLabelingService.buildLabels`:

```ts
labels.push(...this.eventDomainLabelService.buildDomainLabels({
  evidence: input.evidence,
  topicDomains: input.topicDomains ?? [],
  agentSuggestedDomains: input.agentSuggestedDomains ?? [],
}));
```

Expected: Existing source and trigger labels stay unchanged; new domain labels are appended and deduped.

## 11. Task 3: 实现统一补全服务入口

**Files:**
- Create: `src/signal/enrichment/signal-evidence-enrichment.service.ts`
- Create: `src/signal/enrichment/signal-evidence-enrichment.module.ts`
- Modify: `src/signal/signal.module.ts`
- Test: `test/unit/signal/enrichment/signal-evidence-enrichment.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `EvidenceQualityGateService`
- Produces: `SignalEvidenceEnrichmentService.enrich(input): Promise<EnrichedEvidencePackage>`

- [ ] **Step 1: Write the failing test**

```ts
import { SignalEvidenceEnrichmentService } from '../../../../src/signal/enrichment/signal-evidence-enrichment.service';
import { EvidenceQualityGateService } from '../../../../src/signal/enrichment/evidence-quality-gate.service';

describe('SignalEvidenceEnrichmentService', () => {
  it('loads existing signal evidence and returns a quality gate', async () => {
    const prisma = {
      signal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sig_1',
          signalType: 'x_trend',
          title: 'OpenAI',
          metadata: { region: 'United States' },
        }),
      },
      evidenceItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ev_1',
            signalId: 'sig_1',
            sourceType: 'x_trend',
            claim: 'OpenAI 出现在 United States X 热榜。',
            text: 'OpenAI',
            url: 'https://x.com/search?q=OpenAI',
            confidence: 'medium',
            observedAt: new Date('2026-08-26T07:17:17.684Z'),
          },
        ]),
      },
    };
    const service = new SignalEvidenceEnrichmentService(
      prisma as never,
      new EvidenceQualityGateService(),
      [],
    );

    const result = await service.enrich({
      signalId: 'sig_1',
      mode: 'before_opportunity_mining',
    });

    expect(result.signalId).toBe('sig_1');
    expect(result.evidenceRefs).toEqual(['ev_1']);
    expect(result.qualityGate.canCreateEvent).toBe(false);
    expect(result.conservativeTitle).toBe('United States X 热搜：OpenAI');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/signal-evidence-enrichment.service.spec.ts --runInBand`

Expected: FAIL because service files do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement `SignalEvidenceEnrichmentService` with constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly qualityGate: EvidenceQualityGateService,
  @Optional()
  private readonly strategies: SignalEvidenceEnricher[] = [],
) {}
```

Main behavior:

```ts
async enrich(input: EnrichSignalEvidenceInput): Promise<EnrichedEvidencePackage> {
  const signal = await this.prisma.signal.findUnique({ where: { id: input.signalId } });
  if (!signal) throw new DomainError('Signal 不存在。', 'SIGNAL_NOT_FOUND', { signalId: input.signalId });

  for (const strategy of this.strategies) {
    if (strategy.supports(signal.signalType)) {
      await strategy.enrich({ signal, mode: input.mode, maxEvidence: input.maxEvidence });
    }
  }

  const evidenceItems = await this.prisma.evidenceItem.findMany({
    where: { signalId: signal.id },
    orderBy: { observedAt: 'desc' },
    take: input.maxEvidence ?? 20,
  });
  const quality = this.qualityGate.evaluate({
    signalType: signal.signalType,
    evidenceItems: evidenceItems.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      claim: item.claim,
      text: item.text,
      url: item.url,
      author: item.author,
      confidence: item.confidence,
    })),
  });

  return {
    signalId: signal.id,
    signalType: signal.signalType,
    evidenceRefs: evidenceItems.map((item) => item.id),
    evidenceItems,
    qualityGate: quality,
    conservativeTitle: this.createConservativeTitle(signal),
    enrichmentSummary: quality.missingData.length ? quality.missingData.join('；') : '证据已补全。',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/signal/enrichment/signal-evidence-enrichment.service.spec.ts --runInBand`

Expected: PASS.

## 12. Task 4: X 热搜补全策略

**Files:**
- Create: `src/signal/enrichment/strategies/x-trend-evidence-enricher.ts`
- Modify: `src/agent/tools/core-agent-tools.service.ts`
- Test: `test/unit/signal/enrichment/x-trend-evidence-enricher.spec.ts`

**Interfaces:**
- Consumes: X 搜索工具或现有 `x-account-posts` 插件能力。
- Produces: `x_trend_related_post` Evidence。

- [ ] **Step 1: Write the failing test**

```ts
describe('XTrendEvidenceEnricher', () => {
  it('creates related post evidence for x trend search results', async () => {
    const prisma = {
      evidenceItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ev_post_1' }),
      },
    };
    const searchClient = {
      searchRecentPosts: jest.fn().mockResolvedValue([
        {
          postId: 'post_1',
          authorHandle: 'OpenAI',
          text: 'We released an API update today.',
          url: 'https://x.com/OpenAI/status/post_1',
          publishedAt: new Date('2026-08-26T08:00:00.000Z'),
          metrics: { likes: 100, reposts: 20, replies: 5, quotes: 2, views: 10000 },
        },
      ]),
    };

    const enricher = new XTrendEvidenceEnricher(prisma as never, searchClient as never);
    await enricher.enrich({
      signal: {
        id: 'sig_1',
        rawItemId: 'raw_1',
        signalType: 'x_trend',
        title: 'OpenAI',
        observedAt: new Date('2026-08-26T07:17:17.684Z'),
        metadata: { query: 'OpenAI', region: 'United States' },
      } as never,
      mode: 'before_opportunity_mining',
      maxEvidence: 5,
    });

    expect(searchClient.searchRecentPosts).toHaveBeenCalledWith({
      query: 'OpenAI',
      maxResults: 5,
    });
    expect(prisma.evidenceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signalId: 'sig_1',
          sourceType: 'x_trend_related_post',
          sourceItemId: 'post_1',
          author: 'OpenAI',
          url: 'https://x.com/OpenAI/status/post_1',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/x-trend-evidence-enricher.spec.ts --runInBand`

Expected: FAIL because `XTrendEvidenceEnricher` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- `supports(signalType)` returns `signalType === 'x_trend'`.
- Query uses `signal.metadata.query` first, then `signal.title`.
- Deduplicate by `sourceType + sourceItemId`.
- Save at most `maxEvidence ?? 5` posts.
- If search fails, do not throw; create no evidence and let quality gate mark missing data.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/signal/enrichment/x-trend-evidence-enricher.spec.ts --runInBand`

Expected: PASS.

## 13. Task 5: YouTube 补全策略

**Files:**
- Create: `src/signal/enrichment/strategies/youtube-video-evidence-enricher.ts`
- Test: `test/unit/signal/enrichment/youtube-video-evidence-enricher.spec.ts`

**Interfaces:**
- Consumes: `youtube_video_analyses`
- Produces: `youtube_transcript_analysis` Evidence only when analysis already succeeded.

- [ ] **Step 1: Write the failing test**

```ts
describe('YoutubeVideoEvidenceEnricher', () => {
  it('creates transcript analysis evidence from existing successful analysis', async () => {
    const prisma = {
      youtubeVideoAnalysis: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'analysis_1',
          status: 'succeeded',
          result: { chineseSummary: '该视频用三段式结构解释预测市场。' },
        }),
      },
      evidenceItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ev_youtube_1' }),
      },
    };
    const enricher = new YoutubeVideoEvidenceEnricher(prisma as never);

    await enricher.enrich({
      signal: {
        id: 'sig_youtube_1',
        rawItemId: 'raw_youtube_1',
        signalType: 'youtube_video',
        title: 'Why prediction markets are growing',
        summary: 'Channel 发布的视频',
        metadata: { videoId: 'video_1', url: 'https://youtube.com/watch?v=video_1' },
        observedAt: new Date('2026-08-26T07:17:17.684Z'),
      } as never,
      mode: 'before_opportunity_mining',
    });

    expect(prisma.evidenceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signalId: 'sig_youtube_1',
          sourceType: 'youtube_transcript_analysis',
          claim: 'YouTube 视频已有字幕拆解，可用于解释内容结构。',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/youtube-video-evidence-enricher.spec.ts --runInBand`

Expected: FAIL because strategy does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- `supports(signalType)` returns `signalType === 'youtube_video'`.
- Read latest successful analysis by `signalId`.
- If no succeeded analysis, do not create Evidence.
- If result has `chineseSummary` or `summary` or `analysis`, use it as Evidence text.
- Do not call transcript extraction or model analysis.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/signal/enrichment/youtube-video-evidence-enricher.spec.ts --runInBand`

Expected: PASS.

## 14. Task 6: 主题圈补全策略

**Files:**
- Create: `src/signal/enrichment/strategies/topic-candidate-evidence-enricher.ts`
- Modify: `src/topic-watch/trigger/topic-watch-trigger.service.ts`
- Test: `test/unit/signal/enrichment/topic-candidate-evidence-enricher.spec.ts`
- Test: `test/unit/topic-watch/trigger/topic-watch-trigger.service.spec.ts`

**Interfaces:**
- Consumes: `TopicCandidate.representativeSignalIds`
- Produces: `topic_representative_post` Evidence and candidate quality result.

- [ ] **Step 1: Write the failing test**

```ts
describe('TopicCandidateEvidenceEnricher', () => {
  it('returns representative post evidence for a topic candidate', async () => {
    const prisma = {
      topicCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'candidate_1',
          title: 'OpenAI API 更新',
          representativeSignalIds: ['sig_1'],
        }),
      },
      evidenceItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ev_1',
            signalId: 'sig_1',
            sourceType: 'x_post',
            claim: 'OpenAI 发布 API 更新。',
            text: 'We updated the API.',
            url: 'https://x.com/OpenAI/status/1',
            author: 'OpenAI',
            confidence: 'high',
          },
        ]),
      },
    };
    const enricher = new TopicCandidateEvidenceEnricher(prisma as never);

    const result = await enricher.enrichCandidate('candidate_1');

    expect(result.evidenceRefs).toEqual(['ev_1']);
    expect(result.accountHandles).toEqual(['OpenAI']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/topic-candidate-evidence-enricher.spec.ts --runInBand`

Expected: FAIL because strategy does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- Read candidate by id.
- Read Evidence by `representativeSignalIds`.
- Return refs, account handles, post count and summary.
- In `TopicWatchTriggerService`, call this before creating Event.
- Event title should use candidate title only if quality is usable; otherwise keep candidate as topic candidate and do not create Event.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- test/unit/signal/enrichment/topic-candidate-evidence-enricher.spec.ts test/unit/topic-watch/trigger/topic-watch-trigger.service.spec.ts --runInBand
```

Expected: PASS.

## 15. Task 7: 未来事件补全策略

**Files:**
- Create: `src/signal/enrichment/strategies/future-event-evidence-enricher.ts`
- Test: `test/unit/signal/enrichment/future-event-evidence-enricher.spec.ts`

**Interfaces:**
- Consumes: `future_events`, `future_event_candidates`, `future_event_monitoring_plans`, `evidence_items`
- Produces: quality result that distinguishes future event from active hot event.

- [ ] **Step 1: Write the failing test**

```ts
describe('FutureEventEvidenceEnricher', () => {
  it('keeps official calendar evidence as future-event evidence, not active hot event evidence', async () => {
    const prisma = {
      futureEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'future_1',
          title: 'FOMC meeting',
          scheduledAt: new Date('2026-09-16T18:00:00.000Z'),
          sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
        }),
      },
      evidenceItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ev_future_1' }),
      },
    };
    const enricher = new FutureEventEvidenceEnricher(prisma as never);

    const result = await enricher.enrich({
      signal: {
        id: 'sig_future_1',
        rawItemId: 'raw_future_1',
        signalType: 'future_event',
        title: 'FOMC meeting',
        observedAt: new Date('2026-08-26T07:17:17.684Z'),
        metadata: { sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
      } as never,
      mode: 'before_opportunity_mining',
    });

    expect(result.kind).toBe('future_event');
    expect(prisma.evidenceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'future_event_official_schedule',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/signal/enrichment/future-event-evidence-enricher.spec.ts --runInBand`

Expected: FAIL because strategy does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- `supports(signalType)` returns `signalType === 'future_event'`.
- Create or reuse official schedule Evidence.
- Return `kind = 'future_event'`.
- Do not mark as active hot event unless monitoring signals exist.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/signal/enrichment/future-event-evidence-enricher.spec.ts --runInBand`

Expected: PASS.

## 16. Task 8: 接入 Opportunity Mining 前置补全

**Files:**
- Modify: `src/opportunity/mining/opportunity-mining-evidence.service.ts`
- Modify: `src/opportunity/mining/opportunity-mining-agent.service.ts`
- Modify: `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`
- Test: `test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts`

**Interfaces:**
- Consumes: `SignalEvidenceEnrichmentService.enrich`
- Produces: Agent goal includes `evidenceMemory.qualityGate`

- [ ] **Step 1: Write the failing test**

```ts
it('does not persist high-confidence event when enriched evidence is not event-ready', async () => {
  const evidenceService = {
    load: jest.fn().mockResolvedValue({
      signals: [{ id: 'sig_1', signalType: 'x_trend', title: 'Keyword' }],
      evidence: [{ id: 'ev_1', sourceType: 'x_trend', claim: 'Keyword 出现在 X 热榜。' }],
      missingData: [],
      qualityGate: {
        canCreateEvent: false,
        canUseHighConfidence: false,
        missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
      },
    }),
  };
  const miningAgent = {
    evaluateGoalWithRun: jest.fn().mockResolvedValue({
      agentRunId: 'run_1',
      decision: {
        decision: 'create_event',
        title: 'Keyword 热搜事件',
        opportunityType: 'industry_topic',
        summary: 'Keyword 正在热搜。',
        whyNow: '热度上升。',
        whyItMatters: '值得关注。',
        productAngles: [],
        contentWindow: '短期',
        confidence: 'high',
        evidenceRefs: ['ev_1'],
        missingData: [],
        riskNotes: [],
      },
    }),
  };

  await expect(runOrchestratorWithMocks({ evidenceService, miningAgent })).resolves.toEqual(
    expect.objectContaining({
      decision: expect.objectContaining({
        confidence: 'low',
        missingData: expect.arrayContaining(['缺少解释热搜原因的相关帖子或外部来源。']),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts --runInBand`

Expected: FAIL because quality gate is ignored.

- [ ] **Step 3: Write minimal implementation**

Modify behavior:

- `OpportunityMiningEvidenceService.load` calls enrichment for each seed Signal.
- Return `qualityGate` and merged missing data.
- `OpportunityMiningAgentService` serializes `qualityGate` into `evidenceMemory`.
- `OpportunityMiningOrchestratorService` downgrades or blocks invalid decisions:
  - If `qualityGate.canCreateEvent === false` and decision is `create_event`, convert to `create_opportunity` with low confidence or keep result in suggest-only mode.
  - Append quality gate missing data.
  - If persisted as Event, never allow `confidence = high` when `canUseHighConfidence === false`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts --runInBand`

Expected: PASS.

## 17. Task 9: 更新 Agent 规则文档

**Files:**
- Modify: `docs/runtime/opportunity-mining/global-principles.md`
- Modify: `docs/runtime/opportunity-mining/x-trend-rules.md`
- Modify: `docs/runtime/opportunity-mining/youtube-video-rules.md`
- Modify: `docs/runtime/opportunity-mining/future-event-rules.md`
- Test: `test/unit/agent/openai-model-provider.spec.ts`

**Interfaces:**
- Consumes: `evidenceMemory.qualityGate`
- Produces: Agent must respect evidence quality.

- [ ] **Step 1: Write the failing test**

Add assertion in `openai-model-provider.spec.ts`:

```ts
expect(body.input[0].content[0].text).toContain('如果 evidenceMemory.qualityGate.canCreateEvent 为 false，不要输出高置信度 create_event');
expect(body.input[0].content[0].text).toContain('所有运营可见自然语言字段必须使用中文');
expect(body.input[0].content[0].text).toContain('领域标签只能从固定集合中选择');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/agent/openai-model-provider.spec.ts --runInBand`

Expected: FAIL because prompt does not include this contract.

- [ ] **Step 3: Write minimal implementation**

Add to opportunity mining contract:

```text
如果 goal.evidenceMemory.qualityGate.canCreateEvent 为 false，不要输出高置信度 create_event。
如果只有来源热度证据，没有解释原因证据，标题必须使用保守来源标题，并在 missingData 说明缺少原因证据。
未来事件只能作为未来事件或预热机会，不要写成已发生热点。
YouTube 没有字幕拆解时，不要解释“为什么火”。
所有运营可见自然语言字段必须使用中文；专有名词、平台名、账号名和固定领域标签 code 可保留英文。
领域标签只能从固定集合中选择：AI、Technology、Politics & Elections、Geopolitics & Conflict、Macro & Financial Markets、Crypto & Web3、Prediction Markets、Official Schedule。
```

Update runtime Markdown rules with the same constraints.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/agent/openai-model-provider.spec.ts --runInBand`

Expected: PASS.

## 18. Task 10: 暴露补全查看接口

**Files:**
- Create: `src/signal/enrichment/signal-evidence-enrichment.controller.ts`
- Modify: `src/signal/enrichment/signal-evidence-enrichment.module.ts`
- Test: `test/e2e/signal-evidence-enrichment.e2e-spec.ts`

**Interfaces:**
- Consumes: `SignalEvidenceEnrichmentService`
- Produces:
  - `GET /signals/:id/enrichment`
  - `POST /signals/:id/enrichment/refresh`

- [ ] **Step 1: Write the failing e2e test**

```ts
it('returns enrichment package for a signal', async () => {
  await request(app.getHttpServer())
    .get('/signals/sig_1/enrichment')
    .expect(200)
    .expect((response) => {
      expect(response.body.signalId).toBe('sig_1');
      expect(response.body.qualityGate).toBeDefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/e2e/signal-evidence-enrichment.e2e-spec.ts --runInBand`

Expected: FAIL with 404.

- [ ] **Step 3: Write minimal implementation**

Controller behavior:

- `GET /signals/:id/enrichment` returns current package without forcing external search.
- `POST /signals/:id/enrichment/refresh` runs `mode = manual_refresh`.
- Domain errors map to 400 with `{ statusCode, message, code, details }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/e2e/signal-evidence-enrichment.e2e-spec.ts --runInBand`

Expected: PASS.

## 19. Task 11: 前端事件卡片使用证据质量和领域筛选

**Files:**
- Modify: `/Users/qmk/work/hotspot-monitor/hotspot-master/src/pages/Events/Events.tsx`
- Modify: `/Users/qmk/work/hotspot-monitor/hotspot-master/src/pages/Events/EventEvidenceDetail.tsx`
- Test: Run frontend build.

**Interfaces:**
- Consumes: Event detail API with `labels` / `sourceSummary` / `identity` / enrichment quality.
- Produces: 证据不足时显示保守标题和缺失证据提示；事件列表可按固定领域标签筛选。

- [ ] **Step 1: Inspect current API response mapping**

Run:

```bash
rg -n "sourceSummary|identity|evidenceRefs|labels|查看证据链|完整上下文" /Users/qmk/work/hotspot-monitor/hotspot-master/src/pages/Events
```

Expected: Identify exact render blocks.

- [ ] **Step 2: Modify card copy rules**

Rules:

- If backend title is conservative, display it as-is.
- If `missingData` contains `缺少解释热搜原因`, show a small warning pill `证据不足`。
- Do not invent frontend-only event titles.
- Evidence detail page should show quality gate missing data near evidence list.

- [ ] **Step 3: Run build**

Run:

```bash
cd /Users/qmk/work/hotspot-monitor/hotspot-master
npm run build
```

Expected: PASS.

## 20. Verification

Run backend checks:

```bash
cd /Users/qmk/work/hotspot-monitor/hotspot-agent-backend
npm test -- test/unit/signal/enrichment/evidence-quality-gate.service.spec.ts test/unit/signal/enrichment/signal-evidence-enrichment.service.spec.ts test/unit/signal/enrichment/x-trend-evidence-enricher.spec.ts test/unit/signal/enrichment/youtube-video-evidence-enricher.spec.ts test/unit/signal/enrichment/topic-candidate-evidence-enricher.spec.ts test/unit/signal/enrichment/future-event-evidence-enricher.spec.ts --runInBand
npm test -- test/unit/opportunity/labeling/event-domain-label.service.spec.ts test/unit/opportunity/labeling/event-labeling.service.spec.ts --runInBand
npm test -- test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts test/unit/topic-watch/trigger/topic-watch-trigger.service.spec.ts test/unit/agent/openai-model-provider.spec.ts --runInBand
npm run typecheck
npm run build
```

Run frontend check:

```bash
cd /Users/qmk/work/hotspot-monitor/hotspot-master
npm run build
```

Manual verification:

1. 采集 X 热搜后，查看新生成 x_trend Signal 的 enrichment。
2. 对只有榜单证据的热搜，确认不再生成 `xxx热搜事件`。
3. 对能补到相关帖子的热搜，确认事件标题来自帖子事实。
4. 对 YouTube 无拆解视频，确认不展示“为什么火”的强结论。
5. 对已有拆解视频，确认拆解摘要进入证据链。
6. 对未来事件，确认标题和状态体现“未来/预热”，不是已发生热点。
7. 对主题圈候选，确认单帖候选不会高置信创建事件，多账号同事实候选可创建事件。
8. 对事件列表，确认可以按 `AI`、`Technology`、`Politics & Elections`、`Geopolitics & Conflict`、`Macro & Financial Markets`、`Crypto & Web3`、`Prediction Markets`、`Official Schedule` 筛选。
9. 对非中文来源，确认事件标题、摘要、缺失数据、风险说明、证据 claim 和 AI 结论均为中文。

## 21. Rollout

1. 先只在 `before_opportunity_mining` 模式启用质量门槛，不改变采集写入。
2. 再给 X 热搜启用相关帖子补全。
3. 然后接入 YouTube、主题圈、未来事件策略。
4. 最后打开 Topic Watch Trigger 的质量门槛。

## 22. Backward Compatibility

- 已存在的旧 Event 不自动重写标题。
- 新增接口只读或手动 refresh，不影响现有列表接口。
- 补全失败不会导致采集失败。
- 旧证据仍保留；新证据通过 `sourceType` 区分。
- 已存在的旧 Event 如果没有领域标签，列表可显示为“未标注”，后续通过手动刷新补全。

## 23. Self-Review

- Spec coverage: 已覆盖 X 热搜、主题圈、YouTube、未来事件四类来源的补全策略。
- Evidence gate: 已明确证据不足时不能高置信创建 Event。
- Domain labels: 已明确固定领域集合、写入方式、判定优先级和筛选验证。
- Chinese output: 已明确运营可见自然语言字段必须中文化。
- Frontend: 已明确前端不造标题，只显示后端质量结论。
- Placeholder scan: 未发现占位词或未完成标记。
- Type consistency: `EnrichSignalEvidenceInput`、`EnrichedEvidencePackage`、`EvidenceQualityGateResult` 在任务中保持一致。

## 24. 当前实现状态（2026-08-27）

已完成：

- 新增统一补全类型、`EvidenceQualityGateService` 和 `SignalEvidenceEnrichmentService`。
- 新增可插拔补全策略注入 token：`SIGNAL_EVIDENCE_ENRICHERS`。
- 新增 `XTrendEvidenceEnricher`：对 X 热搜 Signal 通过 twitterapi.io `advanced_search` 拉取 Top 帖，写入 `x_trend_related_post` 证据。
- 新增 `YoutubeTranscriptEvidenceEnricher`：把已成功的 YouTube 字幕拆解结果转成 `youtube_transcript_analysis` 证据。
- 质量门禁已识别 `x_account_post`、`x_trend_related_post`、`youtube_transcript_analysis`、`future_event_source_item`、`future_event_monitoring_signal` 等可解释证据。
- 新增固定领域标签服务，领域仅允许：`AI`、`Technology`、`Politics & Elections`、`Geopolitics & Conflict`、`Macro & Financial Markets`、`Crypto & Web3`、`Prediction Markets`、`Official Schedule`。
- `EventLabelingService` 已合并来源标签、触发标签和领域标签。
- `OpportunityMiningEvidenceService` 已在挖掘前调用补全层，并把 `enrichedPackages`、质量门禁缺失项传给 Agent。
- `OpportunityMiningAgentService` 已把 `enrichedPackages` 序列化给工作流模型。
- `OpportunityMiningOrchestratorService` 已增加写库前质量门禁：证据不足时不写入正式 Event。
- `opportunity_mining` 模型合约和运行时规则文档已补充中文输出约束与固定领域约束。

已验证：

- `npm test -- test/unit/signal/enrichment/evidence-quality-gate.service.spec.ts test/unit/signal/enrichment/signal-evidence-enrichment.service.spec.ts test/unit/signal/enrichment/x-trend-evidence-enricher.spec.ts test/unit/signal/enrichment/youtube-transcript-evidence-enricher.spec.ts test/unit/opportunity/event-domain-label.service.spec.ts src/opportunity/labeling/event-labeling.service.spec.ts test/unit/opportunity/opportunity-mining-agent.service.spec.ts test/unit/opportunity/opportunity-mining-evidence.service.spec.ts test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts test/unit/agent/openai-model-provider.spec.ts --runInBand`
- `npm run typecheck`

后续未完成：

- 事件卡片前端按领域标签筛选展示。
- 旧数据中已经生成的薄证据 Event 需要单独清理或重跑挖掘。
- X 热搜代表帖目前只取 twitterapi.io Top 搜索结果，后续可以继续扩展 Web 新闻、官方账号确认和多来源聚合。
