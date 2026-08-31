# 挖掘热点 Agent 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个统一的热点 / 机会挖掘 Agent，让不同数据源先进入 Signal，再由同一个 Agent 按需调用工具、补充证据、判断是否形成机会或事件。

**Architecture:** 不为每个数据源复制一套“形成事件 Agent”。X 热搜、主题追踪、YouTube、未来事件、搜索结果等数据源只负责采集和标准化为 Signal / Evidence；统一 `OpportunityMiningAgent` 负责调度规则文档、工具和证据，输出结构化决策。运营规则不写死在代码里，而是拆成多份 Markdown 规则文档，由总 Agent 在运行时读取、选择和引用；专项分析器只负责补证据，例如 YouTube 字幕拆解、未来事件 Action Score、主题聚类，不负责最终裁决。

**Tech Stack:** NestJS、TypeScript、Prisma、PostgreSQL、现有 Agent Workflow Engine、Tool Registry、Jest。

**Spec:** `docs/hotspot-agent/OPPORTUNITY_MINING_AGENT_WORKFLOW_ARCHITECTURE.md`

## Global Constraints

- 所有外部数据先进入 `raw_items`，再标准化为 `signals`。
- 机会挖掘 Agent 默认消费 `Signal` 和 `EvidenceItem`，不直接消费平台原始字段。
- Agent 只能调用 Tool Registry 中注册的工具。
- Agent 不允许直接执行 SQL。
- Agent 不允许直接调用未注册外部 URL。
- Agent 的最终结论必须引用 `evidenceRefs`。
- Agent 在证据不足时必须输出 `request_human_review` 或 `ignore`，不能编造事实。
- 热度高不等于事实成立，必须保留事实边界。
- 同一机会或同一事件必须先查重，再决定创建或更新。
- 首版只做“建议生成”，不自动进入内容生成和发布。
- 热点挖掘规则必须来自可版本化 Markdown 文档，不能直接写死在代码里。
- 运营人员可以通过 AI 助手修改规则文档，修改后生成新版本，不覆盖原始预设版本。
- 总 Agent 负责选择本次使用哪些规则文档；代码只负责加载、校验、审计和执行工具。

---

## 1. 目标形态

### 1.1 统一入口

最终系统只有一个核心挖掘入口：

```text
OpportunityMiningAgentService.evaluate(goal)
```

它可以处理不同来源的目标：

```ts
type OpportunityMiningGoalType =
  | 'detect_opportunity'
  | 'form_event'
  | 'analyze_hot_topic'
  | 'analyze_viral_content'
  | 'future_event_response'
```

输入不再区分“X 热搜 Agent / YouTube Agent / 主题圈 Agent”，而是统一为：

```ts
interface OpportunityMiningGoal {
  id: string
  type: OpportunityMiningGoalType
  instruction: string
  seedSignalIds: string[]
  seedEvidenceIds?: string[]
  sourceContext?: Record<string, unknown>
  ruleDocuments: OpportunityRuleDocument[]
  constraints: {
    maxToolCalls: number
    maxRunMs: number
    allowedToolCategories: string[]
    writeMode: 'suggest_only' | 'allow_create'
  }
}
```

### 1.2 规则文档包

热点挖掘 Agent 不直接内置业务规则，而是读取一个可版本化的规则文档包：

```text
docs/runtime/opportunity-mining/
  README.md
  global-principles.md
  source-routing.md
  x-trend-rules.md
  topic-watch-rules.md
  youtube-video-rules.md
  future-event-rules.md
  product-angle-rules.md
  dedupe-and-evidence-rules.md
  output-policy.md
```

每份文档职责：

- `README.md`：说明规则包用途、版本、变更记录和重置方式。
- `global-principles.md`：所有来源共用的判断原则，例如事实边界、证据要求、人工复核条件。
- `source-routing.md`：告诉总 Agent 不同 Signal 类型应该优先读取哪些子规则。
- `x-trend-rules.md`：X 热搜相关规则，只描述运营判断，不写服务端字段实现。
- `topic-watch-rules.md`：主题追踪相关规则，解释主题聚类、讨论扩散、圈层账号价值。
- `youtube-video-rules.md`：YouTube 爆款视频和字幕拆解相关规则。
- `future-event-rules.md`：未来事件预热和响应窗口相关规则。
- `product-angle-rules.md`：产品承接角度、账号适配、内容窗口判断。
- `dedupe-and-evidence-rules.md`：去重、证据引用、相似机会处理、风险说明。
- `output-policy.md`：最终输出结构、允许决策、禁止行为。

规则文档和 Agent 的关系：

- 规则文档不是固定代码工作流，也不是一次性写死的 Prompt。
- 总 Agent 每次运行时先读取 active 规则包，再根据 Signal 类型、目标和已有证据选择需要参考的子文档。
- 子文档可以描述“需要什么证据”“遇到什么现象倾向形成机会”“什么情况需要人工复核”，但不要求写成固定字段或固定阈值。
- 运营人员通过 AI 助手修改规则时，AI 助手负责理解系统上下文、调整相关子文档、生成 draft 版本和测试建议。
- 代码只提供规则包加载、版本管理、测试运行、审计、工具执行和输出校验，不在业务逻辑里判断某个热点一定触发或不触发。

运行时流程：

```text
Signal 进入挖掘
→ RulePackLoader 读取规则文档清单
→ 总 Agent 根据 Signal 类型和目标选择子规则
→ Agent 按子规则决定是否调用工具补证据
→ Agent 输出结构化 decision
→ Validator 校验证据引用和输出协议
→ Orchestrator 按 writeMode 写入建议或仅返回结果
```

规则修改流程：

```text
运营人员提出修改诉求
→ AI 助手读取当前规则包和系统上下文
→ 生成新版本规则文档
→ 保存为 draft 版本
→ 运行短流程测试
→ 测试通过后激活
→ 原预设版本保留，可随时重置
```

代码层只关心文档路径、版本、激活状态、审计记录、工具执行和输出校验；业务阈值、判断口径、产品承接策略都写在 Markdown 规则文档里。

### 1.3 输出协议

复用并强化现有 `OpportunityMiningDecision`：

```ts
interface OpportunityMiningDecision {
  decision:
    | 'create_opportunity'
    | 'create_event'
    | 'update_existing_opportunity'
    | 'create_insight'
    | 'ignore'
    | 'request_human_review'

  title: string
  opportunityType:
    | 'news_event'
    | 'industry_topic'
    | 'viral_post'
    | 'viral_video'
    | 'meme'
    | 'competitor_signal'
    | 'future_event'
    | 'product_angle'
    | 'unknown'

  summary: string
  whyNow: string
  whyItMatters: string
  productAngles: string[]
  contentWindow: string
  confidence: 'high' | 'medium' | 'low'
  evidenceRefs: string[]
  missingData: string[]
  riskNotes: string[]
}
```

---

## 2. 当前代码基础

已有能力：

- `src/signal/`：RawItem / Signal / Evidence 基础数据层。
- `src/data-source/plugins/`：X 热搜、X 账号帖子、YouTube、Future Events 插件。
- `src/agent/tool-registry/`：工具注册与执行。
- `src/agent/workflow-engine/`：Agent Workflow Engine。
- `src/agent/tools/core-agent-tools.service.ts`：已有 Signal / Evidence / Opportunity / Event / Topic / Task 工具。
- `src/opportunity/mining/opportunity-mining-agent.service.ts`：已有初版机会挖掘 Agent 服务。
- `src/opportunity/opportunity.repository.ts`：已有 Opportunity / Event 写入与查询。

主要缺口：

- `OpportunityMiningAgentService` 仍偏“固定输入”，没有完整 Goal / Evidence Memory / Tool Loop 语义。
- 当前工具字段选择、预算、证据归一化还不够强。
- 缺少“从待挖掘 Signal 批量启动 Agent”的调度器。
- 缺少挖掘运行结果和 Signal 的绑定状态，容易重复挖掘。
- 缺少统一的去重、幂等和建议写入边界。
- 缺少面向前端的“热点挖掘结果 / 待确认机会”接口。
- 缺少可版本化规则文档包和规则包治理能力。

---

## 3. 文件结构规划

### 3.1 新增文件

- `docs/runtime/opportunity-mining/README.md`  
  热点挖掘规则包说明、版本、重置方式。

- `docs/runtime/opportunity-mining/global-principles.md`  
  统一事实边界、证据要求和人工复核原则。

- `docs/runtime/opportunity-mining/source-routing.md`  
  根据 Signal 类型选择规则文档。

- `docs/runtime/opportunity-mining/x-trend-rules.md`  
  X 热搜挖掘规则。

- `docs/runtime/opportunity-mining/topic-watch-rules.md`  
  主题追踪挖掘规则。

- `docs/runtime/opportunity-mining/youtube-video-rules.md`  
  YouTube 爆款视频挖掘规则。

- `docs/runtime/opportunity-mining/future-event-rules.md`  
  未来事件机会挖掘规则。

- `docs/runtime/opportunity-mining/product-angle-rules.md`  
  产品承接和账号适配规则。

- `docs/runtime/opportunity-mining/dedupe-and-evidence-rules.md`  
  去重、证据引用和风险边界规则。

- `docs/runtime/opportunity-mining/output-policy.md`  
  输出结构和禁止行为。

- `src/opportunity/rule-pack/opportunity-rule-pack.types.ts`  
  定义规则包、规则文档、激活状态。

- `src/opportunity/rule-pack/opportunity-rule-pack-loader.service.ts`  
  从 Markdown 文件系统加载 active 规则包。

- `src/opportunity/rule-pack/opportunity-rule-pack-governance.service.ts`  
  支持 AI 修改、保存 draft、激活、重置规则包。

- `src/opportunity/mining/opportunity-mining-goal.types.ts`  
  定义统一 Goal、预算、运行上下文、来源上下文。

- `src/opportunity/mining/opportunity-mining-decision.validator.ts`  
  校验 Agent 输出结构、证据引用、决策合法性。

- `src/opportunity/mining/opportunity-mining-evidence.service.ts`  
  从 seed Signal、seed Evidence 和工具结果中组装 Evidence Memory。

- `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`  
  统一执行挖掘：加载输入、调用 Agent、校验结果、按 `writeMode` 写入建议。

- `src/opportunity/mining/opportunity-mining-scheduler.service.ts`  
  定时扫描未挖掘 Signal，按来源策略批量触发挖掘。

- `src/opportunity/mining/opportunity-mining-signal-selector.service.ts`  
  选择值得进入挖掘的 Signal，避免每条低价值原始信号都调用模型。

- `test/unit/opportunity/opportunity-mining-decision.validator.spec.ts`
- `test/unit/opportunity/opportunity-mining-evidence.service.spec.ts`
- `test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts`
- `test/unit/opportunity/opportunity-mining-signal-selector.service.spec.ts`
- `test/unit/opportunity/opportunity-mining-scheduler.service.spec.ts`
- `test/unit/opportunity/opportunity-rule-pack-loader.service.spec.ts`
- `test/unit/opportunity/opportunity-rule-pack-governance.service.spec.ts`

### 3.2 修改文件

- `src/opportunity/mining/opportunity-mining-agent.service.ts`  
  从固定 `signals/evidence/topicCandidates` 输入升级为统一 Goal 输入。

- `src/opportunity/opportunity.controller.ts`  
  增加手动运行挖掘、查看挖掘候选、确认机会接口。

- `src/opportunity/opportunity.repository.ts`  
  增加幂等写入、相似查询、Signal 挖掘状态辅助查询。

- `src/opportunity/opportunity.module.ts`  
  注册新服务和调度器。

- `src/agent/tools/core-agent-tools.service.ts`  
  补充按 Signal ID 查 Evidence、按来源查 Signal、按事件名查相似 Event 的工具。

- `src/agent/model-provider/openai-model-provider.ts`  
  强化 `opportunity_mining` 系统提示词，要求读取本次传入的规则文档、按需调用工具和引用证据。

- `prisma/schema.prisma`  
  增加挖掘状态表或字段，记录 Signal 是否已进入挖掘、最新决策和幂等 key；增加规则包版本表。

---

## 4. 数据模型计划

### Task 1: 增加规则包版本表和挖掘运行索引表

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/opportunity/opportunity.types.ts`
- Modify: `src/opportunity/opportunity.repository.ts`
- Test: `test/unit/opportunity/opportunity.repository.spec.ts`

**Interfaces:**
- Produces: `OpportunityRulePack`
- Produces: `OpportunityMiningSignalRun`
- Produces: `OpportunityRepository.createRulePack(input)`
- Produces: `OpportunityRepository.findActiveRulePack()`
- Produces: `OpportunityRepository.createMiningSignalRun(input)`
- Produces: `OpportunityRepository.findRecentMiningRunBySignal(signalId)`

**Prisma model:**

```prisma
model OpportunityRulePack {
  id          String   @id @default(cuid())
  version     Int
  status      String
  basePath    String
  manifest    Json
  description String?
  generatedBy String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([version])
  @@index([status, version])
  @@map("opportunity_rule_packs")
}

model OpportunityMiningSignalRun {
  id             String   @id @default(cuid())
  signalId       String
  agentRunId     String?
  rulePackId     String?
  status         String
  decision       String?
  targetType     String?
  targetId       String?
  idempotencyKey String   @unique
  errorMessage   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([signalId, createdAt])
  @@index([status, createdAt])
  @@map("opportunity_mining_signal_runs")
}
```

**步骤：**

- [ ] 写失败测试：只能有一个 active 规则包。
- [ ] 写失败测试：同一 `idempotencyKey` 只能创建一条挖掘记录。
- [ ] 运行测试，确认失败。
- [ ] 修改 Prisma schema，执行 `npx prisma generate`。
- [ ] 实现 repository 方法。
- [ ] 运行 repository 测试。
- [ ] 运行 `npm run typecheck`。

**验收标准：**

- 可以查询当前 active 规则包。
- 可以按 Signal 查询最近挖掘记录。
- 可以用幂等 key 防止重复挖掘。
- 数据库迁移后表存在。

### Task 2: 创建默认规则文档包

**Files:**
- Create: `docs/runtime/opportunity-mining/README.md`
- Create: `docs/runtime/opportunity-mining/global-principles.md`
- Create: `docs/runtime/opportunity-mining/source-routing.md`
- Create: `docs/runtime/opportunity-mining/x-trend-rules.md`
- Create: `docs/runtime/opportunity-mining/topic-watch-rules.md`
- Create: `docs/runtime/opportunity-mining/youtube-video-rules.md`
- Create: `docs/runtime/opportunity-mining/future-event-rules.md`
- Create: `docs/runtime/opportunity-mining/product-angle-rules.md`
- Create: `docs/runtime/opportunity-mining/dedupe-and-evidence-rules.md`
- Create: `docs/runtime/opportunity-mining/output-policy.md`
- Test: `test/unit/opportunity/opportunity-rule-pack-loader.service.spec.ts`

**规则文档写法要求：**

- 用中文。
- 写业务判断，不写后端实现细节。
- 每条规则必须说明适用对象、需要证据、输出倾向。
- 规则允许自然语言，不要求固定字段。
- 必须明确“不确定时如何处理”。

**步骤：**

- [ ] 写失败测试：加载器找不到默认规则文档时失败。
- [ ] 创建默认规则文档。
- [ ] 每份文档写清楚本规则的目的、适用 Signal、证据要求、输出倾向。
- [ ] 运行加载器测试。

**验收标准：**

- 默认规则包可以完整加载。
- 文档可以被 AI 助手修改。
- 代码没有把业务阈值写死。

### Task 3: 实现规则包加载器

**Files:**
- Create: `src/opportunity/rule-pack/opportunity-rule-pack.types.ts`
- Create: `src/opportunity/rule-pack/opportunity-rule-pack-loader.service.ts`
- Modify: `src/opportunity/opportunity.module.ts`
- Test: `test/unit/opportunity/opportunity-rule-pack-loader.service.spec.ts`

**Interfaces:**

```ts
export interface OpportunityRuleDocument {
  id: string
  title: string
  path: string
  markdown: string
}

export interface OpportunityRulePackSnapshot {
  id: string
  version: number
  documents: OpportunityRuleDocument[]
}

loadActiveRulePack(): Promise<OpportunityRulePackSnapshot>
selectDocuments(input: {
  signalType: string
  goalType: string
  rulePack: OpportunityRulePackSnapshot
}): OpportunityRuleDocument[]
```

**步骤：**

- [ ] 写失败测试：`x_trend` 会选择 `global-principles.md`、`source-routing.md`、`x-trend-rules.md`、`dedupe-and-evidence-rules.md`、`output-policy.md`。
- [ ] 写失败测试：未知 Signal 类型会选择全局规则、去重证据规则和输出规则。
- [ ] 实现加载器。
- [ ] 运行测试。

**验收标准：**

- 总 Agent 每次运行都能拿到规则文档快照。
- 不同 Signal 类型可以选择不同规则子集。
- 未知来源也能走通全局规则。

---

## 5. Agent 输入与校验

### Task 4: 定义统一挖掘 Goal

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-goal.types.ts`
- Modify: `src/opportunity/mining/opportunity-mining-agent.service.ts`
- Test: `test/unit/opportunity/opportunity-mining-agent.service.spec.ts`

**Interfaces:**

```ts
export interface OpportunityMiningGoal {
  id: string
  type:
    | 'detect_opportunity'
    | 'form_event'
    | 'analyze_hot_topic'
    | 'analyze_viral_content'
    | 'future_event_response'
  instruction: string
  seedSignalIds: string[]
  seedEvidenceIds?: string[]
  sourceContext?: JsonObject
  ruleDocuments: OpportunityRuleDocument[]
  constraints: OpportunityMiningConstraints
}

export interface OpportunityMiningConstraints {
  maxToolCalls: number
  maxRunMs: number
  allowedToolCategories: string[]
  writeMode: 'suggest_only' | 'allow_create'
}
```

**步骤：**

- [ ] 写失败测试：`OpportunityMiningAgentService.evaluateGoal(goal)` 会把 Goal 原样传给 workflow engine。
- [ ] 运行测试，确认 `evaluateGoal` 不存在。
- [ ] 新增 `OpportunityMiningGoal` 类型。
- [ ] 实现 `evaluateGoal(goal)`。
- [ ] 保留旧 `evaluate(input)` 作为兼容包装，内部转换成 Goal。
- [ ] 运行测试。

**验收标准：**

- 新调用方使用 `evaluateGoal`。
- 旧测试不破坏。
- Goal 中包含约束、seed Signal、sourceContext 和本次选中的规则文档。

### Task 5: 增加决策校验器

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-decision.validator.ts`
- Modify: `src/opportunity/mining/opportunity-mining-agent.service.ts`
- Test: `test/unit/opportunity/opportunity-mining-decision.validator.spec.ts`

**Rules:**

- `create_opportunity`、`create_event`、`update_existing_opportunity` 必须有 `evidenceRefs`。
- `ignore` 可以没有证据，但必须有 `summary` 和 `riskNotes`。
- `request_human_review` 必须有 `missingData` 或 `riskNotes`。
- `confidence` 只能是 `high | medium | low`。
- `decision` 和 `opportunityType` 只能使用白名单。
- `productAngles` 必须是数组。

**步骤：**

- [ ] 写失败测试：无 `evidenceRefs` 的 `create_event` 会抛出 `OPPORTUNITY_MINING_EVIDENCE_REQUIRED`。
- [ ] 写失败测试：无 `missingData/riskNotes` 的 `request_human_review` 会抛出 `OPPORTUNITY_MINING_REVIEW_REASON_REQUIRED`。
- [ ] 实现校验器。
- [ ] 接入 `OpportunityMiningAgentService`。
- [ ] 运行测试。

**验收标准：**

- Agent 输出不会绕过证据规则。
- 所有错误使用 `DomainError`，错误码稳定。

---

## 6. Evidence Memory 与工具结果归一化

### Task 6: 实现 Evidence Memory 装载服务

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-evidence.service.ts`
- Test: `test/unit/opportunity/opportunity-mining-evidence.service.spec.ts`

**Interfaces:**

```ts
export interface OpportunityMiningEvidenceMemory {
  signals: JsonObject[]
  evidence: JsonObject[]
}

load(input: {
  seedSignalIds: string[]
  seedEvidenceIds?: string[]
  maxEvidencePerSignal?: number
}): Promise<OpportunityMiningEvidenceMemory>
```

**步骤：**

- [ ] 写失败测试：给定 `seedSignalIds`，服务会加载 Signal 及其 Evidence。
- [ ] 写失败测试：Signal 不存在时记录 missingData，不抛出不可恢复异常。
- [ ] 实现查询逻辑。
- [ ] 限制每个 Signal 最多加载 20 条 Evidence。
- [ ] 运行测试。

**验收标准：**

- Agent 初始上下文不再只依赖调用方提前塞完整对象。
- 缺失证据被如实记录。

### Task 7: 强化核心工具

**Files:**
- Modify: `src/agent/tools/core-agent-tools.service.ts`
- Test: `test/unit/agent/core-agent-tools.service.spec.ts`

**新增 / 强化工具：**

```text
signal.getById
signal.getBySource
signal.getRelated
evidence.getBySignalId
event.findSimilar
opportunity.findSimilar
```

**步骤：**

- [ ] 写失败测试：`signal.getById` 能按 id 返回指定字段。
- [ ] 写失败测试：`evidence.getBySignalId` 能返回同一 Signal 的证据。
- [ ] 写失败测试：`signal.getRelated` 能按 title/summary 查相似 Signal。
- [ ] 实现工具。
- [ ] 确认工具输出只返回 requested fields 或默认 fields。
- [ ] 运行测试。

**验收标准：**

- Agent 可以按需补数据。
- 工具输出受字段白名单控制。
- 工具调用会记录在 `agent_tool_calls`。

---

## 7. 统一挖掘编排

### Task 8: 实现 OpportunityMiningOrchestrator

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`
- Modify: `src/opportunity/opportunity.repository.ts`
- Modify: `src/opportunity/opportunity.module.ts`
- Test: `test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts`

**Interfaces:**

```ts
run(input: {
  goal: OpportunityMiningGoal
}): Promise<{
  decision: OpportunityMiningDecision
  target?: { type: 'opportunity' | 'event'; id: string }
  agentRunId: string
}>
```

**Behavior:**

- 加载 Evidence Memory。
- 加载 active 规则包。
- 根据 Signal 类型选择本次规则文档。
- 调用 `OpportunityMiningAgentService.evaluateGoal`。
- 校验最终决策。
- 如果 `writeMode = suggest_only`，只返回决策，不写 Opportunity/Event。
- 如果 `writeMode = allow_create`：
  - `create_opportunity` 写入 `opportunities`。
  - `create_event` 写入 `events`。
  - `update_existing_opportunity` 首版只返回目标，不自动改正文。
  - `ignore` 和 `request_human_review` 只记录挖掘运行。

**步骤：**

- [ ] 写失败测试：`suggest_only` 不写入 `opportunities`。
- [ ] 写失败测试：Orchestrator 会把 `x_trend` 对应规则文档传给 Agent。
- [ ] 写失败测试：`allow_create + create_opportunity` 写入机会并记录挖掘状态。
- [ ] 写失败测试：Agent 输出 `ignore` 时不创建机会。
- [ ] 实现编排服务。
- [ ] 运行测试。

**验收标准：**

- 写入边界明确。
- 同一 Signal 不会重复创建机会。
- 所有挖掘都有审计记录。

---

## 8. Signal 选择与调度

### Task 9: 实现待挖掘 Signal 选择器

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-signal-selector.service.ts`
- Test: `test/unit/opportunity/opportunity-mining-signal-selector.service.spec.ts`

**首版选择方式：**

- 只读取 active 规则包中允许进入挖掘的 Signal 类型。
- 每类 Signal 的 lookback、batch 上限和优先级来自 `source-routing.md`。
- 代码只实现通用过滤：时间窗口、去重、batch size、失败重试间隔。
- 排除已经在 `opportunity_mining_signal_runs` 中成功处理过的 Signal。

**步骤：**

- [ ] 写失败测试：已成功挖掘的 Signal 不会再次被选中。
- [ ] 写失败测试：不同 Signal 类型的 lookback 来自规则文档解析结果。
- [ ] 实现选择器。
- [ ] 运行测试。

**验收标准：**

- 调度器不会对所有历史数据盲目调用模型。
- 选择器不写死业务阈值。
- 运营修改 `source-routing.md` 后，可以改变进入挖掘的范围。

### Task 10: 实现挖掘调度器

**Files:**
- Create: `src/opportunity/mining/opportunity-mining-scheduler.service.ts`
- Modify: `src/opportunity/opportunity.module.ts`
- Test: `test/unit/opportunity/opportunity-mining-scheduler.service.spec.ts`

**Environment:**

```env
OPPORTUNITY_MINING_SCHEDULER_ENABLED=true
OPPORTUNITY_MINING_TICK_MS=60000
OPPORTUNITY_MINING_BATCH_SIZE=10
```

**Behavior:**

- 每 60 秒检查一次。
- 每批最多选择 10 条 Signal。
- 每条 Signal 创建一个 Goal。
- 默认 `writeMode = suggest_only`。
- 失败记录错误，不阻塞下一条。

**步骤：**

- [ ] 写失败测试：环境变量关闭时不启动。
- [ ] 写失败测试：调度器每次最多处理 batch size 条 Signal。
- [ ] 写失败测试：单条失败不会阻塞后续 Signal。
- [ ] 实现调度器。
- [ ] 运行测试。

**验收标准：**

- 后端启动后会自动挖掘热点候选。
- 不会重复处理已成功挖掘的 Signal。
- 不会一次性刷爆模型调用。

---

## 9. API 与前端联调

### Task 11: 增加规则包治理 API

**Files:**
- Create: `src/opportunity/rule-pack/opportunity-rule-pack-governance.service.ts`
- Modify: `src/opportunity/opportunity.controller.ts`
- Test: `test/e2e/opportunity.e2e-spec.ts`

**Endpoints:**

```text
GET  /opportunities/rule-pack
POST /opportunities/rule-pack/draft
POST /opportunities/rule-pack/:id/activate
POST /opportunities/rule-pack/reset
POST /opportunities/rule-pack/test-run
```

**Behavior:**

- `GET /opportunities/rule-pack` 返回当前 active 规则文档。
- `POST /opportunities/rule-pack/draft` 保存 AI 修改后的 draft，不覆盖 active。
- `POST /opportunities/rule-pack/:id/activate` 激活指定版本。
- `POST /opportunities/rule-pack/reset` 恢复预设规则包。
- `POST /opportunities/rule-pack/test-run` 用指定 Signal 做短流程测试，不写机会。

**步骤：**

- [ ] 写失败 e2e：读取 active 规则包返回多份 Markdown 文档。
- [ ] 写失败 e2e：保存 draft 后 active 版本不变。
- [ ] 写失败 e2e：test-run 使用 draft 文档并返回 decision。
- [ ] 实现治理服务和接口。
- [ ] 运行 e2e。

**验收标准：**

- 运营可以通过 AI 助手修改规则。
- 修改不会覆盖原始规则。
- 激活前可以短流程测试。
- 可以重置到预设版本。

### Task 12: 增加热点挖掘 API

**Files:**
- Modify: `src/opportunity/opportunity.controller.ts`
- Test: `test/e2e/opportunity.e2e-spec.ts`

**Endpoints:**

```text
POST /opportunities/mine
POST /opportunities/mine-signal/:signalId
GET  /opportunities/mining-runs
GET  /opportunities
POST /opportunities/:id/confirm
POST /opportunities/:id/ignore
```

**Behavior:**

- `POST /opportunities/mine` 保留现有能力，但内部改走 Orchestrator。
- `POST /opportunities/mine-signal/:signalId` 手动挖掘单条 Signal。
- `GET /opportunities/mining-runs` 用于前端查看 Agent 运行和失败原因。

**步骤：**

- [ ] 写失败 e2e：手动挖掘单条 Signal 返回结构化 decision。
- [ ] 写失败 e2e：获取 mining runs 返回状态、decision、targetId。
- [ ] 实现 controller。
- [ ] 运行 e2e。

**验收标准：**

- 前端可以手动触发某条 Signal 的挖掘。
- 前端可以看到挖掘失败原因。
- 机会确认仍然是人工动作。

### Task 13: 前端热点挖掘结果页

**Files:**
- Modify: `hotspot-master/src/api/opportunities.ts`
- Create or Modify: `hotspot-master/src/pages/Opportunities/Opportunities.tsx`
- Modify: `hotspot-master/src/components/Sidebar.tsx`

**UI Requirements:**

- 展示机会标题、类型、置信度、内容窗口、证据数量。
- 展示 `whyNow`、`whyItMatters`、`productAngles`。
- 展示 `missingData` 和 `riskNotes`。
- 支持确认 / 忽略。
- 支持手动选择 Signal 触发挖掘。
- 支持查看当前规则包。
- 支持通过 AI 修改规则包、保存 draft、测试、激活、重置。

**步骤：**

- [ ] 定义前端 API 类型。
- [ ] 接入 `GET /opportunities`。
- [ ] 接入 `GET /opportunities/mining-runs`。
- [ ] 实现机会列表。
- [ ] 实现机会详情。
- [ ] 实现确认 / 忽略按钮。
- [ ] 运行 `npm run build`。

**验收标准：**

- 运营能看到 Agent 产出的热点机会。
- 运营能看到为什么创建、缺什么数据、风险是什么。
- 运营能人工确认进入后续任务分发。

---

## 10. Agent Prompt 与模型协议

### Task 14: 强化 Opportunity Mining Prompt

**Files:**
- Modify: `src/agent/model-provider/openai-model-provider.ts`
- Test: `test/unit/opportunity/opportunity-mining-agent.service.spec.ts`

**Prompt Requirements:**

模型必须遵守：

- 必须读取本次传入的 `ruleDocuments`。
- 必须说明最终决策主要引用了哪些规则文档。
- 先判断是否需要工具。
- 能用现有证据判断时，可以直接 final。
- 事实必须引用 evidenceRefs。
- 不确定内容写入 `missingData`。
- 风险写入 `riskNotes`。
- 找到相似机会时优先 `update_existing_opportunity`。
- 证据不足但值得人工看时输出 `request_human_review`。
- 不值得做时输出 `ignore`。

**步骤：**

- [ ] 写测试：模型返回无证据 create_opportunity 时服务抛错。
- [ ] 写测试：Goal 缺少规则文档时服务抛错。
- [ ] 写测试：模型返回 request_human_review 且 missingData 非空时通过。
- [ ] 更新 prompt。
- [ ] 运行测试。

**验收标准：**

- Prompt 与校验器共同约束输出。
- Agent 不会把平台热度直接当事实。

---

## 11. 来源规则拆分策略

这一部分定义默认规则包如何拆分。它不是固定不变的系统逻辑，而是第一版可编辑规则文档的建议结构。后续运营人员可以通过 AI 助手修改任意子文档，保存为新版本并测试后激活。

### 11.1 X 热搜

```text
x_trend Signal
→ OpportunityMiningSignalSelector
→ OpportunityMiningAgent
→ create_opportunity / create_event / ignore
```

默认拆分为：

- `x-trend-rules.md`：描述热搜排名、跨地区上榜、排名变化、搜索意图、新闻性和产品承接价值应该如何判断。
- `source-routing.md`：描述什么样的 X 热搜 Signal 优先进入挖掘，以及进入挖掘时应同时参考哪些子规则。
- `dedupe-and-evidence-rules.md`：描述如何检查相似事件、相似机会和证据边界。

### 11.2 主题圈

```text
x_post Signal
→ TopicAggregation 形成 TopicCandidate
→ TopicCandidate 作为 sourceContext
→ OpportunityMiningAgent 判断是否形成机会
```

默认拆分为：

- `topic-watch-rules.md`：描述主题聚类、圈层账号扩散、关键账号参与、讨论密度、讨论质量、异常噪音和人工复核条件。
- `source-routing.md`：描述哪些主题候选值得进入挖掘，以及不同主题类型的优先级。
- 主题热度指标、代表账号和相关帖子只作为 Evidence / sourceContext，不作为代码里的唯一触发条件。

### 11.3 YouTube

```text
youtube_video Signal
→ transcript analysis
→ Evidence
→ OpportunityMiningAgent 判断是否为 viral_video / insight / ignore
```

默认拆分为：

- `youtube-video-rules.md`：描述如何从标题、发布时间、频道、统计数据、字幕拆解和内容结构里判断是否有选题价值。
- `product-angle-rules.md`：描述如何判断视频主题是否可以被自身产品承接。
- `output-policy.md`：描述输出为机会、洞察或忽略时的结构要求。

### 11.4 未来事件

```text
future_event Signal
→ Action Score
→ Monitoring Evidence
→ OpportunityMiningAgent 判断 future_event opportunity
```

默认拆分为：

- `future-event-rules.md`：描述未来事件的预热窗口、事件发生中观察点、事件发生后跟进点和不同事件类型的响应方式。
- `source-routing.md`：描述哪些未来事件 Signal 应优先进入挖掘。
- Action Score 是证据，不是最终裁决。未来事件是否值得响应由规则文档和总 Agent 结合证据判断。

---

## 12. 测试策略

必须覆盖：

- 规则文档加载器。
- 规则包治理服务。
- 决策校验器。
- Evidence Memory 装载。
- 工具字段选择。
- Orchestrator 的 `suggest_only` 和 `allow_create`。
- Signal 选择器去重。
- Scheduler batch 和失败隔离。
- API e2e。

推荐命令：

```bash
npm run typecheck
npm test -- --runInBand test/unit/opportunity/opportunity-rule-pack-loader.service.spec.ts
npm test -- --runInBand test/unit/opportunity
npm test -- --runInBand test/e2e/opportunity.e2e-spec.ts
npm test -- --runInBand
```

---

## 13. 分阶段验收

### 第一阶段验收

- 可以手动传入 Signal ID，让 Agent 输出结构化 decision。
- Agent 每次运行会携带本次选中的规则文档。
- Agent 可以按需调用 `signal.search`、`evidence.search`、`opportunity.findSimilar`。
- 无证据创建机会会失败。

### 第二阶段验收

- 后端启动后自动扫描待挖掘 Signal。
- 每批限制数量。
- 已挖掘 Signal 不重复处理。
- 机会默认是 `suggested`，需要人工确认。
- 修改 `source-routing.md` 后，进入挖掘的 Signal 范围会改变。

### 第三阶段验收

- 前端展示热点机会。
- 前端可以查看和修改规则包。
- 前端可以测试 draft 规则包。
- 运营能看到证据、风险、缺失数据。
- 运营确认后可进入任务分发。

---

## 14. 非目标

首版不做：

- 自动发布内容。
- 自动确认机会。
- 每个平台单独复制一套形成事件 Agent。
- 把运营规则写死在代码里。
- 修改规则时覆盖预设版本。
- 让 Agent 直接执行 SQL。
- 让 Agent 直接访问任意 URL。
- 把任何固定流程原样固化成不可编辑规则。

---

## 15. 自检

- 这份计划覆盖了统一 Agent、工具调用、证据引用、去重、调度、API、前端展示。
- 数据源边界明确：数据源只提供 Signal / Evidence，不拥有独立形成事件 Agent。
- 默认规则只作为可版本化 Markdown 规则包存在，不作为硬编码裁决链。
- 每个实现任务都有独立测试入口。
