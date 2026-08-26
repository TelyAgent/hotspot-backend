# 跨来源事件聚合实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现跨来源事件聚合能力，让 X 热搜、重点主题、未来事件等来源独立触发后，可以在事件管理层识别同一现实事件、合并来源上下文、保留审计，并在事件详情页展示合并判断依据。

**Architecture:** 来源层只负责形成自己的子 Event Context Pack，不负责跨来源合并。事件管理层新增 `EventMergeAgent` 和合并数据模型：先召回候选主 Event，再按主体、核心动作、对象、时间、地点、状态、核心事实输出结构化合并判断；高置信自动合并，中置信进入人工复核但不阻塞独立响应，硬冲突保持独立并可建立关联 Event。

**Tech Stack:** NestJS、TypeScript、Prisma、PostgreSQL、LangGraph Agent Workflow Engine、Tool Registry、Jest、React、Ant Design。

**Spec:** `/Users/qmk/work/hotspot-monitor/hotspot-monitor-doc/_bmad-output/specs/spec-event-merge/SPEC.md` 与 `/Users/qmk/work/hotspot-monitor/hotspot-monitor-doc/_bmad-output/specs/spec-event-merge/event-merge-rules.md`

## Global Constraints

- 热搜榜、未来事件和主题圈分别按照自身规则触发；来源层不查询、不等待其他来源，也不执行跨来源合并。
- 来源门槛决定响应资格，事件匹配只决定是否去重；合并不得成为新的响应门禁。
- 事件管理不得再定义“明显热度跃迁”；来源达到自身门槛即构成该来源的一次有效触发。
- 标题、关键词、语言、榜单地区、热度或相同人物不能单独作为合并依据。
- Signal、热搜排名、代表帖子和主题圈讨论不得因合并被升级为现实事实证据。
- 合并不得重写历史 Event、Evidence、内容、发布记录或其版本引用。
- 自动合并、人工决定、上下文变化、任务影响和关联关系必须完整审计。
- 通过全部合并硬门槛且 `merge_confidence >= 0.95` 才允许自动合并。
- `0.80 <= merge_confidence < 0.95` 必须保持独立并正常路由，同时进入人工复核。
- `merge_confidence < 0.80` 必须保持独立 Event 并正常路由。
- 命中任一硬冲突时禁止自动合并。
- 默认响应任务唯一边界为 `Main Event × Account × Skill Version`。
- 已发布内容及其 Event Context Pack 版本保持不可变。

---

## 1. 目标业务流

```text
来源达到触发门槛
→ 生成 Source Event Context Pack
→ 召回候选主 Event
→ EventMergeAgent 判断是否同一现实事件
→ 写入合并判断记录
├─ merge_confidence >= 0.95 且无硬冲突：自动合并到主 Event
├─ 0.80–0.9499：保持独立 Event，进入人工复核
├─ < 0.80：保持独立 Event
└─ 硬冲突：保持独立 Event，可建立关联关系建议
→ 根据主 Event 响应状态处理内容候选、提醒和复盘追踪
```

## 2. 文件结构规划

### 2.1 后端新增文件

- `src/event-merge/event-merge.module.ts`  
  注册事件聚合相关服务。

- `src/event-merge/event-merge.types.ts`  
  定义 Source Event Context Pack、合并维度、合并决策、前端详情 DTO。

- `src/event-merge/event-merge.repository.ts`  
  封装 `EventSourceContext`、`EventMergeDecision`、`EventReviewQueueItem`、`EventRelation` 的读写。

- `src/event-merge/event-identity.service.ts`  
  负责从 Event / Evidence / Signal 中整理用于比较的身份字段。

- `src/event-merge/event-candidate-recall.service.ts`  
  根据主体、对象、时间窗口、来源类型召回候选主 Event。

- `src/event-merge/event-merge-agent.service.ts`  
  调用 Agent Workflow Engine，输出结构化合并判断。

- `src/event-merge/event-merge-orchestrator.service.ts`  
  串联子包创建、候选召回、Agent 判断、自动合并、人工复核和响应影响。

- `src/event-merge/event-merge.controller.ts`  
  提供事件聚合详情、人工确认合并、拒绝合并、建立关联 Event 的 API。

- `src/event-merge/event-merge-decision.validator.ts`  
  校验合并决策结构、分数范围、硬冲突和结论一致性。

- `src/event-merge/event-merge-response-impact.service.ts`  
  处理合并后对内容候选、已发布记录、运营提醒的影响。

- `docs/runtime/event-merge/README.md`  
  事件聚合 Agent 规则包说明。

- `docs/runtime/event-merge/identity-dimensions.md`  
  主体、动作、对象、时间、地点、状态、核心事实的判断口径。

- `docs/runtime/event-merge/merge-thresholds.md`  
  `0.95` 自动合并、`0.80` 人工复核、硬冲突规则。

- `docs/runtime/event-merge/response-impact-rules.md`  
  后到来源、未发布候选、已发布内容的处理规则。

### 2.2 后端修改文件

- `prisma/schema.prisma`  
  增加事件聚合相关表。

- `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`  
  创建 Event 前不再直接落主 Event，而是构造 Source Event Context Pack 后进入事件聚合 Orchestrator。

- `src/opportunity/opportunity.repository.ts`  
  保留 Event 基础读写，新增按主 Event 查询来源子包和合并详情的入口可以转交给 `EventMergeRepository`。

- `src/content/hotspot-operation/hotspot-operation.service.ts`  
  发布候选生成时读取主 Event 的当前 Context Pack；已发布记录继续引用发布时的 Context Pack 版本。

- `src/app.module.ts`  
  引入 `EventMergeModule`。

### 2.3 前端新增或修改文件

- `hotspot-master/src/api/eventMerge.ts`  
  新增事件聚合详情、人工确认合并、拒绝合并、建立关联 Event 的 API。

- `hotspot-master/src/data/types.ts`  
  增加事件聚合详情类型。

- `hotspot-master/src/pages/Events/Events.tsx`  
  `关联与聚合` Tab 接入真实聚合详情。

- `hotspot-master/src/pages/Events/EventIdentityDecisionCard.tsx`  
  新增截图中的 `Event Identity Decision` 卡片组件。

- `hotspot-master/src/pages/Events/EventIdentityDecisionCard.module.css`  
  独立维护聚合卡片样式。

## 3. 数据模型设计

### 3.1 EventSourceContext

每次来源触发后先写入来源子包，而不是直接把所有内容塞进主 Event。

```prisma
model EventSourceContext {
  id              String   @id @default(cuid())
  mainEventId     String?
  sourceEventId   String?
  sourceType      String
  triggerType     String
  triggerRuleCode String?
  ruleVersion     String?
  contextVersion  Int      @default(1)
  title           String
  summary         String
  identity        Json
  evidenceRefs    Json
  signalRefs      Json
  payload         Json
  triggeredAt     DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([mainEventId, sourceType])
  @@index([sourceType, triggeredAt])
  @@map("event_source_contexts")
}
```

`identity` 的结构：

```ts
interface EventIdentity {
  subject: string
  action: string
  object: string
  time: {
    exactAt?: string
    startAt?: string
    endAt?: string
    timezone?: string
  }
  location?: string
  state: 'rumored' | 'expected' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'denied' | 'unknown'
  coreFact: string
}
```

### 3.2 EventMergeDecision

保存每一次“是否合并”的判断，供审计和前端展示。

```prisma
model EventMergeDecision {
  id                    String   @id @default(cuid())
  incomingContextId      String
  candidateMainEventId   String?
  decision              String
  mergeConfidence       Float
  hardConflict          Boolean  @default(false)
  dimensionResults      Json
  conflictPoints        Json
  evidenceRefs          Json
  impact                Json
  agentRunId            String?
  decidedBy             String
  decidedAt             DateTime @default(now())
  createdAt             DateTime @default(now())

  @@index([incomingContextId])
  @@index([candidateMainEventId, decidedAt])
  @@map("event_merge_decisions")
}
```

`dimensionResults` 的结构：

```ts
interface EventMergeDimensionResult {
  dimension: 'subject' | 'action' | 'object' | 'time_location' | 'state' | 'core_fact'
  label: string
  score: number
  result: 'compatible' | 'conflict' | 'uncertain'
  comparison: string
  evidenceRefs: string[]
}
```

### 3.3 EventReviewQueueItem

保存中置信或冲突合并判断，前端后续可以做人工处理。

```prisma
model EventReviewQueueItem {
  id              String    @id @default(cuid())
  reviewType      String
  status          String
  decisionId      String
  incomingEventId String?
  candidateEventId String?
  reason          String
  payload         Json
  resolvedBy      String?
  resolvedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([status, createdAt])
  @@map("event_review_queue_items")
}
```

### 3.4 EventRelation

用于保存“正式落地”“更正”“反转”“后续进展”等独立关联 Event。

```prisma
model EventRelation {
  id            String   @id @default(cuid())
  fromEventId   String
  toEventId     String
  relationType  String
  reason        String
  evidenceRefs  Json
  createdBy     String
  createdAt     DateTime @default(now())

  @@unique([fromEventId, toEventId, relationType])
  @@index([fromEventId])
  @@index([toEventId])
  @@map("event_relations")
}
```

### 3.5 Event 增量字段

在 `Event` 上补充主 Event 必需字段：

```prisma
model Event {
  canonicalEventId String?
  contextVersion   Int     @default(1)
  identity         Json?
  sourceSummary    Json?
}
```

说明：

- `canonicalEventId` 为空表示自己就是主 Event；非空表示它已经被人工晚合并到另一个主 Event。
- `contextVersion` 每次主 Event 的来源上下文发生变化时递增。
- `identity` 保存主 Event 当前归一化身份。
- `sourceSummary` 保存来源类型计数、首次触发时间、最近触发时间，用于列表和详情快速展示。

## 4. 后端任务拆分

### Task 1: 建立事件聚合数据模型

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `src/event-merge/event-merge.types.ts`
- Create: `src/event-merge/event-merge.repository.ts`
- Test: `test/unit/event-merge/event-merge.repository.spec.ts`

**Interfaces:**

- Produces:

```ts
interface CreateSourceContextInput {
  mainEventId?: string
  sourceType: string
  triggerType: string
  triggerRuleCode?: string
  ruleVersion?: string
  title: string
  summary: string
  identity: EventIdentity
  evidenceRefs: string[]
  signalRefs: string[]
  payload: Record<string, unknown>
  triggeredAt: Date
}

class EventMergeRepository {
  createSourceContext(input: CreateSourceContextInput): Promise<EventSourceContext>
  createMergeDecision(input: CreateMergeDecisionInput): Promise<EventMergeDecision>
  listSourceContexts(mainEventId: string): Promise<EventSourceContext[]>
  getLatestMergeDecision(mainEventId: string): Promise<EventMergeDecision | null>
}
```

- [ ] **Step 1: 写失败测试**

测试 `createSourceContext` 能保存来源、规则版本、Evidence、identity，并能通过 `mainEventId` 查回。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/unit/event-merge/event-merge.repository.spec.ts`

Expected: FAIL，提示 `EventMergeRepository` 或 Prisma 模型不存在。

- [ ] **Step 3: 修改 Prisma Schema 并生成 Client**

Run: `npm run prisma:generate`

- [ ] **Step 4: 实现 Repository**

只封装数据读写，不在 Repository 中写合并判断逻辑。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- test/unit/event-merge/event-merge.repository.spec.ts`

### Task 2: 构造 Source Event Context Pack

**Files:**

- Create: `src/event-merge/event-identity.service.ts`
- Test: `test/unit/event-merge/event-identity.service.spec.ts`

**Interfaces:**

```ts
class EventIdentityService {
  buildFromOpportunityDecision(input: {
    decision: OpportunityMiningDecision
    evidence: EvidenceItem[]
    signals: Signal[]
  }): EventIdentity
}
```

- [ ] **Step 1: 写失败测试**

测试从 `OpportunityMiningDecision` 和 Evidence 中提取：

- subject
- action
- object
- time
- location
- state
- coreFact

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/unit/event-merge/event-identity.service.spec.ts`

- [ ] **Step 3: 实现最小规则提取**

首版允许使用 Agent 决策中的 `metadata.identity`；如果缺失，则从 `title / summary / occurredAt / evidence` 做保守 fallback，并把缺失字段标为 `unknown`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- test/unit/event-merge/event-identity.service.spec.ts`

### Task 3: 候选主 Event 召回

**Files:**

- Create: `src/event-merge/event-candidate-recall.service.ts`
- Test: `test/unit/event-merge/event-candidate-recall.service.spec.ts`

**Interfaces:**

```ts
class EventCandidateRecallService {
  recall(input: {
    identity: EventIdentity
    sourceType: string
    limit?: number
  }): Promise<Event[]>
}
```

- [ ] **Step 1: 写失败测试**

测试同一主体、同一对象、相近时间的 Event 会被召回；不同主体或硬冲突状态不应该排在前面。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- test/unit/event-merge/event-candidate-recall.service.spec.ts`

- [ ] **Step 3: 实现召回**

首版使用 PostgreSQL 查询：

- `identity.subject` 精确或别名命中。
- `identity.object` 精确或相似命中。
- `occurredAt` 或 `identity.time` 在可配置窗口内。
- 限制最近 30 天。
- 最多召回 10 个候选。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- test/unit/event-merge/event-candidate-recall.service.spec.ts`

### Task 4: EventMergeAgent 输出合并判断

**Files:**

- Create: `src/event-merge/event-merge-agent.service.ts`
- Create: `src/event-merge/event-merge-decision.validator.ts`
- Create: `docs/runtime/event-merge/README.md`
- Create: `docs/runtime/event-merge/identity-dimensions.md`
- Create: `docs/runtime/event-merge/merge-thresholds.md`
- Test: `test/unit/event-merge/event-merge-agent.service.spec.ts`
- Test: `test/unit/event-merge/event-merge-decision.validator.spec.ts`

**Interfaces:**

```ts
interface EventMergeAgentDecision {
  decision: 'auto_merge' | 'human_review' | 'keep_independent' | 'create_related_event'
  mergeConfidence: number
  hardConflict: boolean
  dimensionResults: EventMergeDimensionResult[]
  conflictPoints: string[]
  relationSuggestion?: {
    relationType: 'follow_up' | 'official_result' | 'change' | 'correction' | 'reversal' | 'parent_child'
    reason: string
  }
  impact: {
    responseAction: 'route_once' | 'route_independently' | 'update_context_only' | 'freeze_candidates' | 'review_published'
    reason: string
  }
  evidenceRefs: string[]
}

class EventMergeAgentService {
  compare(input: {
    incoming: EventSourceContext
    candidate: Event
    candidateContexts: EventSourceContext[]
  }): Promise<EventMergeAgentDecision>
}
```

- [ ] **Step 1: 写 Validator 失败测试**

覆盖：

- 分数必须在 `0–1`。
- `mergeConfidence >= 0.95` 但 `hardConflict = true` 时不能自动合并。
- `0.80–0.9499` 必须进入人工复核。
- `dimensionResults` 必须包含六个展示维度。

- [ ] **Step 2: 实现 Validator**

校验失败抛出 `DomainError`，错误码使用 `EVENT_MERGE_DECISION_INVALID`。

- [ ] **Step 3: 写 Agent 服务测试**

Mock `AgentWorkflowEngine`，验证输入包含：

- incoming context
- candidate main Event
- candidate source contexts
- event-merge 规则文档

- [ ] **Step 4: 实现 Agent 服务**

`EventMergeAgentService` 不直接调用 OpenAI，只调用系统内 `AgentWorkflowEngine`。

- [ ] **Step 5: 运行测试**

Run: `npm test -- test/unit/event-merge/event-merge-agent.service.spec.ts test/unit/event-merge/event-merge-decision.validator.spec.ts`

### Task 5: 聚合 Orchestrator 接入事件创建链路

**Files:**

- Create: `src/event-merge/event-merge-orchestrator.service.ts`
- Modify: `src/opportunity/mining/opportunity-mining-orchestrator.service.ts`
- Modify: `src/opportunity/opportunity.module.ts`
- Create: `src/event-merge/event-merge.module.ts`
- Test: `test/unit/event-merge/event-merge-orchestrator.service.spec.ts`
- Test: `test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts`

**Interfaces:**

```ts
class EventMergeOrchestratorService {
  ingestTriggeredSourceEvent(input: {
    decision: OpportunityMiningDecision
    evidence: EvidenceItem[]
    signals: Signal[]
    agentRunId?: string
  }): Promise<{
    mainEventId: string
    sourceContextId: string
    mergeDecisionId?: string
    routeMode: 'new_main_event' | 'merged_to_existing' | 'independent_with_review' | 'independent'
  }>
}
```

- [ ] **Step 1: 写自动合并失败测试**

Given 一个新来源子包和一个已有候选 Event，Agent 返回 `auto_merge` 且置信度 `0.97`，Then 复用已有主 Event，追加来源上下文，不创建第二个主 Event。

- [ ] **Step 2: 写人工复核失败测试**

Given Agent 返回 `human_review` 且置信度 `0.88`，Then 创建独立 Event，同时写入人工复核队列。

- [ ] **Step 3: 写硬冲突失败测试**

Given Agent 返回 `create_related_event` 或 `hardConflict = true`，Then 创建独立 Event，并写入关联建议。

- [ ] **Step 4: 实现 Orchestrator**

顺序必须是：

```text
build identity
→ create incoming source context
→ recall candidates
→ compare candidates
→ choose best decision
→ auto merge or create independent event
→ write audit record
→ return route result
```

- [ ] **Step 5: 修改 OpportunityMiningOrchestratorService**

当 `decision.decision === 'create_event'` 时，调用 `EventMergeOrchestratorService.ingestTriggeredSourceEvent`，不再直接 `createEvent`。

- [ ] **Step 6: 运行测试**

Run: `npm test -- test/unit/event-merge/event-merge-orchestrator.service.spec.ts test/unit/opportunity/opportunity-mining-orchestrator.service.spec.ts`

### Task 6: 响应去重与发布保护

**Files:**

- Create: `src/event-merge/event-merge-response-impact.service.ts`
- Modify: `src/content/hotspot-operation/hotspot-operation.service.ts`
- Test: `test/unit/event-merge/event-merge-response-impact.service.spec.ts`
- Test: `test/unit/content/hotspot-operation.service.spec.ts`

**Interfaces:**

```ts
class EventMergeResponseImpactService {
  apply(input: {
    mainEventId: string
    incomingSourceType: string
    mergeDecision: EventMergeAgentDecision
  }): Promise<EventMergeResponseImpact>
}
```

- [ ] **Step 1: 写失败测试**

覆盖：

- 未发布候选只增加来源时保留候选。
- 表达边界变化时标记重新预检。
- 核心事实冲突时冻结候选。
- 已发布后新增来源只提醒，不自动重新生成。
- 已发布内容继续引用旧 Context Pack 版本。

- [ ] **Step 2: 实现响应影响服务**

服务只写状态和提醒，不删除内容、不修改已发布记录。

- [ ] **Step 3: 修改热点运营生成**

生成内容时读取主 Event 当前 `contextVersion`，并把该版本写入 content draft metadata。

- [ ] **Step 4: 修改发布回填**

发布记录保存 `eventId`、`contextVersion`、`contentTaskId`、`draftId`、`accountName`、`url`。

- [ ] **Step 5: 运行测试**

Run: `npm test -- test/unit/event-merge/event-merge-response-impact.service.spec.ts test/unit/content/hotspot-operation.service.spec.ts`

### Task 7: 事件聚合 API

**Files:**

- Create: `src/event-merge/event-merge.controller.ts`
- Modify: `src/event-merge/event-merge.module.ts`
- Test: `test/e2e/event-merge.e2e-spec.ts`

**API:**

```http
GET /events/:eventId/merge-detail
POST /events/:eventId/merge-review/:reviewId/approve
POST /events/:eventId/merge-review/:reviewId/reject
POST /events/:eventId/relations
```

`GET /events/:eventId/merge-detail` 返回：

```ts
interface EventMergeDetailDto {
  eventId: string
  contextVersion: number
  sourceContexts: EventSourceContextDto[]
  latestIdentityDecision?: {
    mergeConfidence: number
    decision: string
    dimensionResults: EventMergeDimensionResult[]
    conflictPoints: string[]
    systemAction: string
    reason: string
  }
  reviewItems: EventReviewQueueItemDto[]
  relations: EventRelationDto[]
}
```

- [ ] **Step 1: 写 e2e 失败测试**

测试 `GET /events/:eventId/merge-detail` 返回来源子包和最新合并判断。

- [ ] **Step 2: 实现 Controller**

只返回当前前端需要的详情数据。

- [ ] **Step 3: 实现人工确认合并**

确认后：

- 将 incoming Event 的 `canonicalEventId` 指向主 Event。
- 冻结重复未发布候选。
- 保留已发布记录。
- 写审计记录。

- [ ] **Step 4: 实现拒绝合并**

拒绝后：Review Item 状态变为 `rejected`，两个 Event 保持独立。

- [ ] **Step 5: 运行 e2e**

Run: `npm test -- test/e2e/event-merge.e2e-spec.ts`

### Task 8: 前端 Event Identity Decision 卡片

**Files:**

- Create: `hotspot-master/src/api/eventMerge.ts`
- Modify: `hotspot-master/src/data/types.ts`
- Create: `hotspot-master/src/pages/Events/EventIdentityDecisionCard.tsx`
- Create: `hotspot-master/src/pages/Events/EventIdentityDecisionCard.module.css`
- Modify: `hotspot-master/src/pages/Events/Events.tsx`

**UI 要求:**

卡片应还原截图中的信息结构：

```text
Event Identity Decision
合并置信度 0.97

判断维度       比较结果                         结论
主体           同一公司或机构                   兼容
核心动作       来源均指向同一正式发布动作       兼容
具体对象       产品或政策对象一致               兼容
时间与地点     处于同一事件窗口，地区无硬冲突   兼容
事件状态       确认状态与后续补充兼容           兼容
核心事实       未发现相互排斥的核心事实         兼容

系统处理：自动合并
置信度不低于 0.95，追加来源上下文到主 Event。
```

**Interfaces:**

```ts
export interface EventMergeDimensionResult {
  dimension: string
  label: string
  score: number
  result: 'compatible' | 'conflict' | 'uncertain'
  comparison: string
  evidenceRefs: string[]
}

export interface EventMergeDetail {
  eventId: string
  contextVersion: number
  sourceContexts: EventSourceContext[]
  latestIdentityDecision?: {
    mergeConfidence: number
    decision: string
    dimensionResults: EventMergeDimensionResult[]
    conflictPoints: string[]
    systemAction: string
    reason: string
  }
}
```

- [ ] **Step 1: 写组件结构**

`EventIdentityDecisionCard` 接收 `latestIdentityDecision`，没有数据时显示“暂无跨来源合并判断”。

- [ ] **Step 2: 接入 `关联与聚合` Tab**

进入详情页后请求 `/events/:eventId/merge-detail`，在 `MergeTab` 中展示：

- Event Identity Decision 卡片。
- 来源子包列表。
- 人工复核队列。
- 关联 Event。

- [ ] **Step 3: 样式实现**

遵循当前页面设计：

- 浅绿色页面背景。
- 白色卡片。
- 8px 到 10px 圆角。
- 置信度数字右上角突出。
- 表格线使用浅灰绿色。
- `兼容` 使用绿色，`冲突` 使用红色，`不确定` 使用琥珀色。
- 系统处理区使用浅黄色背景。

- [ ] **Step 4: 前端构建验证**

Run: `npm run build`

### Task 9: 回填历史数据与迁移策略

**Files:**

- Create: `scripts/backfill-event-source-contexts.ts`
- Create: `scripts/backfill-event-merge-decisions.ts`
- Modify: `package.json`

**Backfill 策略:**

- 现有 Event 每条先生成一个 `EventSourceContext`。
- 来源类型从 `labels.category = source` 或 Evidence `sourceType` 推断。
- 没有可判断来源的 Event 标记为 `unknown`，不强行聚合。
- 历史 Event 不自动合并，只生成候选合并建议，避免误吞旧数据。

- [ ] **Step 1: 写 dry-run 脚本**

输出：

- 现有 Event 数量。
- 可生成来源子包数量。
- 来源类型分布。
- 无法识别来源的 Event 数量。

- [ ] **Step 2: 写 backfill 脚本**

支持：

```bash
npm run backfill:event-contexts -- --dry-run
npm run backfill:event-contexts -- --apply
```

- [ ] **Step 3: 运行 dry-run**

Run: `npm run backfill:event-contexts -- --dry-run`

- [ ] **Step 4: 人工确认后运行 apply**

Run: `npm run backfill:event-contexts -- --apply`

### Task 10: 验收场景

**Files:**

- Create: `test/e2e/event-merge-acceptance.e2e-spec.ts`

- [ ] **AC-1 自动合并**

未来事件和热搜子包通过全部硬门槛且置信度 `0.96`，系统复用同一主 Event、追加来源上下文且不重复创建账号任务。

- [ ] **AC-2 人工复核**

两个子包置信度 `0.88`，系统保持独立并进入人工复核，页面展示维度分数、依据和影响。

- [ ] **AC-3 硬冲突**

一个来源说“计划发布”，另一个来源说“正式发布”，系统禁止自动合并并建议建立“正式落地”关系。

- [ ] **AC-4 迟到来源**

未来事件已发布后，同一事实首次达到热搜门槛，系统追加热搜上下文并只产生一次运营提醒。

- [ ] **AC-5 同类更新**

主 Event 已记录热搜触发，热搜排名再次变化时只更新热搜上下文，不产生提醒或新任务。

- [ ] **AC-6 候选保护**

主 Event 存在未发布候选，后到来源改变表达边界，系统保留候选历史并标记重新预检。

- [ ] **AC-7 发布不可变**

内容基于 Context Pack V1 已发布，新来源使主 Event 更新到 V2，发布记录继续引用 V1。

- [ ] **AC-8 新事实发展**

已有“预计发布”Event，来源报告“正式发布”，系统创建独立关联 Event，不吞并为来源补充。

- [ ] **AC-9 复核不阻塞**

两个来源分别达到触发门槛且置信度 `0.88`，两个独立 Event 均正常向下游路由。

- [ ] **AC-10 低分独立路由**

匹配置信度低于 `0.80`，系统保留两个独立 Event 并分别建立响应资格。

- [ ] **AC-11 晚合并收敛**

两个 Event 已分别路由，一个有未发布候选，一个已有发布记录；人工确认晚合并后，系统冻结重复未发布候选、保留发布版本并将后续默认响应收敛到主 Event。

## 5. 分阶段上线建议

### Phase 1: 只做数据结构和详情展示

目标：

- Event 可以挂来源子包。
- 详情页可以看到来源子包和 `Event Identity Decision` 卡片。
- 不改变现有事件创建流程。

价值：

- 最小风险。
- 先把“事件为什么被认为相同”展示出来。

### Phase 2: 接入自动合并但只处理高置信

目标：

- `merge_confidence >= 0.95` 自动合并。
- `0.80–0.9499` 只进入复核，不做自动合并。
- 低分和硬冲突保持独立。

价值：

- 先解决明显重复事件。
- 避免误合并伤害运营判断。

### Phase 3: 响应去重和发布保护

目标：

- 主 Event 下默认响应去重。
- 已发布内容保留 Context Pack 版本。
- 后到来源触发提醒而不是自动重发。

价值：

- 真正减少重复候选和重复发布。

### Phase 4: 人工晚合并和关联 Event

目标：

- 运营人员可以确认晚合并。
- 可以建立后续进展、正式落地、更正、反转等关联事件。

价值：

- 支持复杂事件演化，不把新事实错误吞并。

## 6. 关键风险与处理

### 6.1 误合并风险

处理：

- 自动合并门槛固定为 `0.95`。
- 硬冲突优先于分数。
- 标题、关键词、热度不能单独作为依据。
- 详情页必须展示每个维度的比较结果。

### 6.2 重复响应风险

处理：

- 内容响应唯一键使用 `Main Event × Account × Skill Version`。
- 合并来源只更新上下文，不重复创建同账号同 Skill 任务。
- 已发布后首次新增来源只提醒，不自动生成或发布。

### 6.3 历史数据污染风险

处理：

- 历史数据只 backfill 来源子包。
- 历史事件不自动合并。
- 所有合并建议进入人工复核或 dry-run 报告。

### 6.4 Agent 输出不稳定风险

处理：

- `EventMergeDecisionValidator` 校验输出。
- 分数、维度、硬冲突、结论必须一致。
- Agent 输出必须引用真实 Evidence。
- 无法判断时进入人工复核或保持独立。

## 7. 自检清单

- [ ] CAP-1 独立来源接入：Task 1、Task 2、Task 5 覆盖。
- [ ] CAP-2 同一事件匹配：Task 3、Task 4 覆盖。
- [ ] CAP-3 合并决策：Task 4、Task 5、Task 10 覆盖。
- [ ] CAP-4 统一来源上下文：Task 1、Task 7、Task 8 覆盖。
- [ ] CAP-5 重复响应控制：Task 6、Task 10 覆盖。
- [ ] CAP-6 在途与已发布保护：Task 6、Task 10 覆盖。
- [ ] CAP-7 事件演化区分：Task 7、Task 10 覆盖。
- [ ] CAP-8 未合并事件路由：Task 5、Task 10 覆盖。
- [ ] 详情页 `Event Identity Decision` 卡片：Task 8 覆盖。
- [ ] 自动合并审计：Task 1、Task 4、Task 5 覆盖。
- [ ] 人工复核不阻塞响应：Task 5、Task 7、Task 10 覆盖。
