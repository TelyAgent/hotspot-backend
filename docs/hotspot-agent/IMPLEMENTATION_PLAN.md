# Hotspot Monitor V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建设一个以 RawItem → Signal → Evidence 为数据地基、以 Agent 工作流为决策核心的运营内容机会发现后端系统。

**Architecture:** 后端使用 NestJS 组织业务模块，PostgreSQL + Prisma 保存业务数据和 Agent 运行记录，BullMQ 承载采集与异步任务，LangGraph 仅封装在 Agent Workflow Engine 内部。系统按数据采集、信号、未来事件、主题追踪、机会挖掘、任务分发、内容生成、效果追踪拆成可独立演进的子系统。

**Tech Stack:** NestJS、TypeScript、Prisma、PostgreSQL、BullMQ、LangGraph、LLM Provider Adapter、Jest。

**Spec:** `docs/hotspot-agent/SYSTEM_ARCHITECTURE_V2.md`

## Global Constraints

- 所有外部数据先进入 RawItem，再标准化为 Signal。
- 所有 Agent 默认消费 Signal 和 Evidence，不直接消费平台原始数据。
- 平台原始数据只作为可追溯证据保留。
- Agent 只能通过 Tool Registry 调用已注册工具。
- Agent 不允许直接执行 SQL。
- Agent 不允许直接调用未注册外部 URL。
- Agent 不允许直接发布内容。
- 所有高风险写操作默认需要人工确认。
- OpenClaw 不作为核心架构依赖，仅作为插件和工具设计参考。
- LangGraph 只封装在 Agent Workflow Engine 内部，业务层不直接依赖 LangGraph。

---

## 1. 子系统拆分

新后端拆成以下子系统：

```text
data-source        数据采集插件子系统
signal             RawItem / Signal / Evidence 子系统
agent              Agent 工作流基础设施
future-event       未来事件子系统
topic-watch        主题追踪子系统
opportunity        机会挖掘子系统
assignment         任务分发子系统
content            内容生成子系统
performance        效果追踪与反馈子系统
provider           外部 Provider 管理
governance         人工确认、权限、审计
```

实施顺序遵循一个原则：

```text
先打数据地基，再做 Agent；
先做只读判断，再做建议写入；
先人工确认，再逐步半自动化。
```

---

## 2. 推荐目录结构

```text
src/
  common/
    errors/
    types/
    utils/

  database/
    prisma.module.ts
    prisma.service.ts

  data-source/
    plugins/
    registry/
    runner/
    dto/
    data-source.module.ts

  signal/
    raw-item/
    signal/
    evidence/
    signal.module.ts

  agent/
    workflow-engine/
    tool-registry/
    run-log/
    model-provider/
    agent.module.ts

  future-event/
    discovery/
    monitoring/
    future-event.module.ts

  topic-watch/
    aggregation/
    monitoring-plan/
    decision/
    topic-watch.module.ts

  opportunity/
    mining/
    opportunity.module.ts

  assignment/
    account-provider/
    decision/
    assignment.module.ts

  content/
    generation/
    draft/
    content.module.ts

  performance/
    tracking/
    feedback/
    performance.module.ts

  governance/
    approval/
    audit/
    governance.module.ts
```

---

## 3. 建设阶段

### 阶段一：项目基础设施

**目标：** 让新后端具备可运行、可测试、可接数据库、可管理配置的基础。

**Files:**
- Modify: `package.json`
- Create: `prisma/schema.prisma`
- Create: `src/database/prisma.module.ts`
- Create: `src/database/prisma.service.ts`
- Create: `src/common/types/json.type.ts`
- Create: `src/common/errors/domain-error.ts`
- Test: `test/unit/database/prisma.service.spec.ts`

**Interfaces:**
- Produces: `PrismaService`
- Produces: `JsonObject`, `JsonValue`
- Produces: `DomainError`

- [x] 安装并配置 Prisma、Jest、ESLint、Prettier。
- [x] 创建 `PrismaService`，统一管理数据库连接生命周期。
- [x] 创建基础错误类型 `DomainError`，后续业务模块统一使用。
- [x] 创建 JSON 类型定义，避免业务层到处使用 `any`。
- [x] 添加健康检查测试和 PrismaService 单元测试。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test`。

**验收标准：**

- `GET /health` 返回 `status=ok`。
- `npm run typecheck` 通过。
- `npm test` 通过。
- 数据库模块可以被其他模块注入。

---

### 阶段二：RawItem / Signal / Evidence 数据地基

**目标：** 建立所有外部数据进入 Agent 前的统一数据层。

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/signal/raw-item/raw-item.types.ts`
- Create: `src/signal/raw-item/raw-item.repository.ts`
- Create: `src/signal/raw-item/raw-item.service.ts`
- Create: `src/signal/signal/signal.types.ts`
- Create: `src/signal/signal/signal.repository.ts`
- Create: `src/signal/signal/signal.service.ts`
- Create: `src/signal/evidence/evidence.types.ts`
- Create: `src/signal/evidence/evidence.repository.ts`
- Create: `src/signal/evidence/evidence.service.ts`
- Create: `src/signal/signal.module.ts`
- Test: `test/unit/signal/raw-item.service.spec.ts`
- Test: `test/unit/signal/signal.service.spec.ts`
- Test: `test/unit/signal/evidence.service.spec.ts`

**Interfaces:**
- Produces: `RawItem`
- Produces: `Signal`
- Produces: `EvidenceItem`
- Produces: `RawItemService.create(input)`
- Produces: `SignalService.createFromRawItem(input)`
- Produces: `EvidenceService.createFromSignal(input)`

- [x] 在 Prisma 中定义 `raw_items` 表。
- [x] 在 Prisma 中定义 `signals` 表。
- [x] 在 Prisma 中定义 `evidence_items` 表。
- [x] 实现 RawItem 写入服务，保留平台原始数据、来源和采集时间。
- [x] 实现 Signal 写入服务，必须关联 RawItem。
- [x] 实现 Evidence 写入服务，必须关联 Signal 或 Tool Result。
- [x] 添加去重键设计：`source + sourceItemId + observedAtBucket`。
- [x] 添加单元测试覆盖 RawItem → Signal → Evidence 主链路。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- signal`。

**验收标准：**

- 任意外部数据可以保存为 RawItem。
- RawItem 可以被标准化为 Signal。
- Signal 可以抽取 Evidence。
- Agent 相关模块不需要直接读取平台原始字段。

---

### 阶段三：DataSource Plugin 子系统

**目标：** 新增平台时，只需要实现采集插件，不重写调度、入库、运行记录和错误处理。

**Files:**
- Create: `src/data-source/plugins/data-source-plugin.interface.ts`
- Create: `src/data-source/plugins/data-source-capability.interface.ts`
- Create: `src/data-source/registry/data-source-plugin.registry.ts`
- Create: `src/data-source/runner/collection-job.types.ts`
- Create: `src/data-source/runner/collection-runner.service.ts`
- Create: `src/data-source/runner/collection-run.repository.ts`
- Create: `src/data-source/data-source.module.ts`
- Create: `src/data-source/plugins/mock/mock.plugin.ts`
- Test: `test/unit/data-source/data-source-plugin.registry.spec.ts`
- Test: `test/unit/data-source/collection-runner.service.spec.ts`

**Interfaces:**
- Produces: `DataSourcePlugin`
- Produces: `DataSourceCapability`
- Produces: `DataSourcePluginRegistry.register(plugin)`
- Produces: `CollectionRunnerService.run(jobConfig)`

- [x] 定义 `DataSourcePlugin` 接口。
- [x] 定义 `DataSourceCapability` 接口。
- [x] 实现插件注册表，禁止重复插件 ID。
- [x] 实现采集任务输入 `CollectionJobConfig`。
- [x] 实现 `CollectionRunnerService`，负责执行插件、保存 RawItem、记录成功失败。
- [x] 实现 `mock.plugin.ts`，用于测试插件机制。
- [x] 添加插件注册、插件执行、插件失败记录测试。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- data-source`。

**验收标准：**

- 一个 mock 插件可以被注册并执行。
- 插件输出可以进入 RawItem。
- 插件失败不会影响其他插件。
- 每次采集都有运行记录和错误信息。

---

### 阶段四：Tool Registry 与 Agent 运行记录

**目标：** 所有 Agent 只能通过受控工具取数和执行动作，所有工具调用可审计。

**Files:**
- Create: `src/agent/tool-registry/agent-tool.interface.ts`
- Create: `src/agent/tool-registry/tool-registry.service.ts`
- Create: `src/agent/tool-registry/tool-executor.service.ts`
- Create: `src/agent/run-log/agent-run.types.ts`
- Create: `src/agent/run-log/agent-run.repository.ts`
- Create: `src/agent/run-log/agent-run-log.service.ts`
- Create: `src/agent/agent.module.ts`
- Test: `test/unit/agent/tool-registry.service.spec.ts`
- Test: `test/unit/agent/tool-executor.service.spec.ts`
- Test: `test/unit/agent/agent-run-log.service.spec.ts`

**Interfaces:**
- Produces: `AgentToolDefinition`
- Produces: `ToolRegistryService.register(tool)`
- Produces: `ToolExecutorService.execute(input)`
- Produces: `AgentRunLogService.startRun(input)`
- Produces: `AgentRunLogService.recordToolCall(input)`
- Produces: `AgentRunLogService.finishRun(input)`

- [x] 定义工具 schema、权限、字段白名单和调用预算。
- [x] 实现工具注册表，禁止未注册工具执行。
- [x] 实现工具执行器，记录输入、输出、耗时和错误。
- [x] 定义 `agent_runs`、`agent_run_steps`、`agent_tool_calls` 表。
- [x] 实现 Agent 运行日志服务。
- [x] 添加工具白名单、字段限制、错误记录测试。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- agent`。

**验收标准：**

- Agent 不能调用未注册工具。
- 每次工具调用都有记录。
- 工具错误会被记录并返回给 Agent。
- 工具字段白名单可以限制输出。

---

### 阶段五：Agent Workflow Engine

**目标：** 封装 LangGraph，让业务模块不直接依赖 LangGraph。

**Files:**
- Create: `src/agent/workflow-engine/agent-workflow-engine.interface.ts`
- Create: `src/agent/workflow-engine/langgraph-agent-workflow-engine.ts`
- Create: `src/agent/workflow-engine/simple-agent-workflow-engine.ts`
- Create: `src/agent/model-provider/model-provider.interface.ts`
- Create: `src/agent/model-provider/mock-model-provider.ts`
- Test: `test/unit/agent/simple-agent-workflow-engine.spec.ts`
- Test: `test/unit/agent/langgraph-agent-workflow-engine.spec.ts`
- Test: `test/unit/agent/mock-model-provider.spec.ts`

**Interfaces:**
- Produces: `AgentWorkflowEngine.run(input): Promise<AgentRunResult>`
- Produces: `ModelProvider.completeStructured(input)`

- [x] 定义 `AgentWorkflowEngine` 接口。
- [x] 定义 `AgentRunInput`、`AgentRunResult`、`AgentStepOutput`。
- [x] 实现 `simple-agent-workflow-engine.ts` 作为测试用同步引擎。
- [x] 定义 `ModelProvider` 接口，隔离具体大模型供应商。
- [x] 实现 `MockModelProvider`，用于单元测试。
- [x] 实现 `LangGraphAgentWorkflowEngine`，使用 `StateGraph` 编排模型步骤、工具步骤和最终决策。
- [x] 添加预算耗尽、工具调用、最终决策测试。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- agent`。

**验收标准：**

- 业务模块只依赖 `AgentWorkflowEngine` 接口。
- 测试可以使用 `SimpleAgentWorkflowEngine` 和 `MockModelProvider`。
- Agent Run 可以记录每一步动作。

---

### 阶段六：未来事件子系统

**目标：** 支持未来事件发现、确认和监控计划生成。

**Files:**
- Create: `src/future-event/future-event.types.ts`
- Create: `src/future-event/future-event.repository.ts`
- Create: `src/future-event/discovery/future-event-discovery-agent.service.ts`
- Create: `src/future-event/monitoring/future-event-monitoring-agent.service.ts`
- Create: `src/future-event/monitoring/future-event-monitoring-plan.service.ts`
- Create: `src/future-event/future-event.module.ts`
- Test: `test/unit/future-event/future-event-monitoring-agent.service.spec.ts`

**Interfaces:**
- Produces: `FutureEvent`
- Produces: `FutureEventCandidate`
- Produces: `FutureEventMonitoringPlan`
- Consumes: `AgentWorkflowEngine`
- Consumes: `ToolRegistryService`

- [x] 定义 `future_events` 表。
- [x] 定义 `future_event_candidates` 表。
- [x] 定义 `future_event_monitoring_plans` 表。
- [x] 实现未来事件写入和查询服务。
- [x] 实现 Monitoring Agent 服务，输入 FutureEvent，输出 MonitoringPlan。
- [x] MonitoringPlan 默认需要人工确认。
- [x] 添加测试覆盖：输入未来事件后生成监控计划。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- future-event`。

**验收标准：**

- 可以创建 FutureEvent。
- Agent 可以生成结构化 MonitoringPlan。
- MonitoringPlan 不直接创建内容任务。

---

### 阶段七：主题追踪与 Topic Aggregation

**目标：** 支持运营人员定义 Topic Watch，并把主题下大量账号帖子聚合成 TopicCandidate。

**Files:**
- Create: `src/topic-watch/topic-watch.types.ts`
- Create: `src/topic-watch/topic-watch.repository.ts`
- Create: `src/topic-watch/monitoring-plan/topic-monitoring-plan.service.ts`
- Create: `src/topic-watch/aggregation/topic-aggregation.service.ts`
- Create: `src/topic-watch/decision/topic-watch-agent.service.ts`
- Create: `src/topic-watch/topic-watch.module.ts`
- Test: `test/unit/topic-watch/topic-aggregation.service.spec.ts`
- Test: `test/unit/topic-watch/topic-watch-agent.service.spec.ts`

**Interfaces:**
- Produces: `TopicWatch`
- Produces: `TopicMonitoringPlan`
- Produces: `TopicCandidate`
- Produces: `TopicWatchDecision`
- Consumes: `SignalService`
- Consumes: `EvidenceService`
- Consumes: `AgentWorkflowEngine`

- [x] 定义 `topic_watches` 表。
- [x] 定义 `topic_monitoring_plans` 表。
- [x] 定义 `topic_candidates` 表。
- [x] 定义 `topic_aggregation_runs` 表。
- [x] 实现 TopicWatch 创建和查询。
- [x] 实现 Topic Monitoring Plan 生成。
- [x] 实现 Topic Aggregation：按时间窗口读取 Signal，生成 TopicCandidate。
- [x] Topic Watch Agent 只消费 TopicCandidate 和 Evidence，不读取全量原始帖子。
- [x] 添加测试覆盖：多个账号帖子聚合为一个 TopicCandidate。
- [x] 添加测试覆盖：候选话题触发 `create_opportunity` 建议。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- topic-watch`。

**验收标准：**

- 一个主题可以有自己的采集规则和触发规则。
- 多账号帖子可以聚合成候选话题。
- Agent 不直接处理全量原始帖子。
- 缺少工具时能返回 missingData。

---

### 阶段八：机会挖掘 Agent

**目标：** 根据 Signal、Evidence、TopicCandidate 判断是否形成 Opportunity 或 Event。

**Files:**
- Create: `src/opportunity/opportunity.types.ts`
- Create: `src/opportunity/opportunity.repository.ts`
- Create: `src/opportunity/mining/opportunity-mining-agent.service.ts`
- Create: `src/opportunity/opportunity.module.ts`
- Test: `test/unit/opportunity/opportunity-mining-agent.service.spec.ts`

**Interfaces:**
- Produces: `Opportunity`
- Produces: `Event`
- Produces: `OpportunityMiningDecision`
- Consumes: `AgentWorkflowEngine`
- Consumes: `ToolRegistryService`
- Consumes: `EvidenceService`

- [x] 定义 `opportunities` 表。
- [x] 定义 `events` 表。
- [x] 实现查重工具：`opportunity.findSimilar`、`event.findSimilar`。
- [x] 实现 Opportunity Mining Agent 服务。
- [x] 输出必须包含 `evidenceRefs`、`missingData`、`riskNotes`。
- [x] 默认不直接写入高风险结果，先创建建议。
- [x] 添加测试覆盖：证据充足时输出 create_opportunity。
- [x] 添加测试覆盖：证据不足时输出 request_human_review。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- opportunity`。

**验收标准：**

- Agent 可以根据不同规则按需调用工具。
- 输出结论必须引用 Evidence。
- 可以识别重复 Opportunity 或 Event。

---

### 阶段九：任务分发 Agent

**目标：** 根据 Opportunity / Event、账号人设、账号规则和历史任务生成分发建议。

**Files:**
- Create: `src/assignment/assignment.types.ts`
- Create: `src/assignment/account-provider/account-provider.interface.ts`
- Create: `src/assignment/account-provider/local-account-provider.service.ts`
- Create: `src/assignment/decision/assignment-agent.service.ts`
- Create: `src/assignment/assignment.repository.ts`
- Create: `src/assignment/assignment.module.ts`
- Test: `test/unit/assignment/assignment-agent.service.spec.ts`

**Interfaces:**
- Produces: `OperatingAccount`
- Produces: `AssignmentDecision`
- Produces: `AssignmentItem`
- Consumes: `Opportunity`
- Consumes: `Event`
- Consumes: `AgentWorkflowEngine`

- [x] 定义 `assignment_runs` 表。
- [x] 定义 `assignment_items` 表。
- [x] 定义 `content_tasks` 表。
- [x] 实现 `AccountProvider` 接口。
- [x] 实现本地账号 Provider。
- [x] 实现 Assignment Agent，输出账号、角度、内容目标和约束。
- [x] 检查重复任务和账号工作负载。
- [x] 默认需要人工确认后创建 ContentTask。
- [x] 添加测试覆盖：同一事件分给不同账号时角度不同。
- [x] 添加测试覆盖：暂停账号不会被分配。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- assignment`。

**验收标准：**

- 账号来源可以通过 Provider 抽象。
- Agent 可以说明选择或跳过账号的理由。
- 不会为多个账号生成完全相同角度。

---

### 阶段十：内容生成 Agent

**目标：** 基于账号任务、证据、账号人设和内容约束生成草稿。

**Files:**
- Create: `src/content/content.types.ts`
- Create: `src/content/draft/content-draft.repository.ts`
- Create: `src/content/generation/content-generation-agent.service.ts`
- Create: `src/content/content.module.ts`
- Test: `test/unit/content/content-generation-agent.service.spec.ts`

**Interfaces:**
- Produces: `ContentDraft`
- Consumes: `ContentTask`
- Consumes: `EvidenceItem`
- Consumes: `AgentWorkflowEngine`

- [x] 定义 `content_drafts` 表。
- [x] 实现 Content Generation Agent。
- [x] 输入必须包含账号人设、内容规则、内容目标、角度、证据。
- [x] 输出草稿必须保留证据引用。
- [x] 支持运营人员追加要求后重新生成。
- [x] 添加测试覆盖：没有 Evidence 时不生成事实性断言。
- [x] 添加测试覆盖：重新生成会保留上一次要求记录。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- content`。

**验收标准：**

- 内容生成不负责判断机会和账号分发。
- 草稿可以追溯到 ContentTask 和 Evidence。
- 重新生成过程可审计。

---

### 阶段十一：效果追踪与策略反馈

**目标：** 追踪发布链接表现，并将结果反馈给机会、分发和内容策略。

**Files:**
- Create: `src/performance/performance.types.ts`
- Create: `src/performance/tracking/published-post.repository.ts`
- Create: `src/performance/tracking/post-metric-snapshot.repository.ts`
- Create: `src/performance/tracking/performance-tracking.service.ts`
- Create: `src/performance/feedback/performance-feedback.service.ts`
- Create: `src/performance/performance.module.ts`
- Test: `test/unit/performance/performance-tracking.service.spec.ts`

**Interfaces:**
- Produces: `PublishedPost`
- Produces: `PostMetricSnapshot`
- Produces: `StrategyFeedback`
- Consumes: `ContentTask`

- [x] 定义 `published_posts` 表。
- [x] 定义 `post_metric_snapshots` 表。
- [x] 实现发布链接回填。
- [x] 实现指标快照写入。
- [x] 实现追踪窗口策略。
- [x] 实现表现反馈聚合。
- [x] 添加测试覆盖：回填链接后可以生成追踪计划。
- [x] 添加测试覆盖：指标达到阈值后生成正向反馈。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test -- performance`。

**验收标准：**

- 发布链接可以被追踪。
- 指标缺失和抓取失败必须如实记录。
- 策略反馈可以被后续 Agent 查询。

---

### 阶段十二：API 与运营工作台接口

**目标：** 为前端提供新系统的最小可用 API。

**Files:**
- Create: `src/signal/signal.controller.ts`
- Create: `src/future-event/future-event.controller.ts`
- Create: `src/topic-watch/topic-watch.controller.ts`
- Create: `src/opportunity/opportunity.controller.ts`
- Create: `src/assignment/assignment.controller.ts`
- Create: `src/content/content.controller.ts`
- Create: `src/performance/performance.controller.ts`
- Test: `test/e2e/health.e2e-spec.ts`
- Test: `test/e2e/topic-watch.e2e-spec.ts`
- Test: `test/e2e/opportunity.e2e-spec.ts`

**Interfaces:**
- Produces: REST API for TopicWatch、Opportunity、Assignment、ContentDraft、Performance。
- Consumes: 各业务服务。

- [x] 添加 TopicWatch 创建、查看、生成监控计划 API。
- [x] 添加 Signal 列表和 Evidence 查看 API。
- [x] 添加 Opportunity 查看和人工确认 API。
- [x] 添加 Assignment 建议查看和确认 API。
- [x] 添加 ContentDraft 生成和重新生成 API。
- [x] 添加发布链接回填和指标查看 API。
- [x] 添加 E2E 测试覆盖主要链路。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test`。

**验收标准：**

- 前端可以配置主题、查看候选话题、查看机会、确认任务、生成草稿、回填发布链接。
- 高风险动作都有确认接口。
- API 返回结构和 Agent 决策结构一致。

---

## 4. 里程碑

### M1：数据地基可用

包含阶段一、阶段二、阶段三。

交付结果：

- 项目可运行。
- RawItem / Signal / Evidence 可写入。
- DataSource Plugin 可注册和执行。

### M2：Agent 基础设施可用

包含阶段四、阶段五。

交付结果：

- Tool Registry 可用。
- Agent Run 可记录。
- Workflow Engine 可替换实现。

### M3：监控对象可用

包含阶段六、阶段七。

交付结果：

- FutureEvent 可生成监控计划。
- TopicWatch 可生成监控计划。
- 主题账号帖子可聚合成 TopicCandidate。

### M4：机会到内容任务可用

包含阶段八、阶段九、阶段十。

交付结果：

- Opportunity Mining Agent 可输出机会。
- Assignment Agent 可输出分发建议。
- Content Agent 可生成草稿。

### M5：效果闭环可用

包含阶段十一、阶段十二。

交付结果：

- 发布链接可回填。
- 指标可追踪。
- 效果反馈可被 Agent 查询。
- 前端可接入最小可用 API。

---

## 5. 测试策略

每个阶段都必须有独立测试。

```text
单元测试：业务服务、聚合逻辑、工具注册、Agent 输出校验。
集成测试：RawItem → Signal → Evidence、Plugin → RawItem、Agent → Tool。
E2E 测试：TopicWatch → TopicCandidate → Opportunity → Assignment → ContentDraft。
```

Agent 测试不依赖真实大模型。

默认使用：

```text
MockModelProvider
SimpleAgentWorkflowEngine
MockTool
```

只有在专门的评估任务里，才调用真实模型。

---

## 6. 风险与控制

### 6.1 Agent 输入过大

控制方式：

- 原始数据先进 RawItem。
- 标准化后进入 Signal。
- 主题下大量帖子先聚合成 TopicCandidate。
- Agent 只看候选话题和证据包。

### 6.2 规则太自由导致不可控

控制方式：

- 规则可以自然语言定义。
- 数据只能通过 Tool Registry 获取。
- 工具有白名单、字段白名单和调用预算。
- 缺少工具时输出 missingData。

### 6.3 Agent 判断不可审计

控制方式：

- 记录 AgentRun。
- 记录每次 ToolCall。
- 记录 EvidenceRefs。
- 记录 missingData 和 riskNotes。

### 6.4 自动写入风险

控制方式：

- 读操作可自动执行。
- 建议型写入默认人工确认。
- 发布、修改配置、外部系统写入必须人工确认。

---

## 7. 执行建议

推荐执行方式：

```text
先完成 M1 和 M2，再开始任何业务 Agent。
```

原因：

- 没有 RawItem / Signal / Evidence，Agent 没有稳定输入。
- 没有 Tool Registry，Agent 调用不可控。
- 没有 AgentRun，后续无法排查 Agent 判断。

因此第一批实际开发任务应该是：

```text
1. 项目基础设施
2. RawItem / Signal / Evidence
3. DataSource Plugin
4. Tool Registry
5. Agent Run Log
```

完成这五块后，再进入 Future Event、Topic Watch 和 Opportunity Mining。
