# 主题追踪 Agent 架构设计

## 1. 核心目标

主题追踪不是固定关键词采集，也不是固定账号列表轮询。

它的核心目标是：

```text
让运营人员定义一个主题及其关注规则，系统根据规则自动判断应该抓取哪些数据、哪些平台、哪些字段，并基于证据判断是否形成机会或事件。
```

也就是说，主题追踪需要支持：

- 不同主题有不同采集策略。
- 不同主题有不同触发规则。
- 不同主题有不同证据要求。
- 规则可以用自然语言表达。
- Agent 能根据规则选择工具和字段。
- 系统只通过已注册工具取数，过程可审计。

推荐设计成：

```text
Topic Watch Agent
```

它不是单独的采集器，而是主题监控策略与取数计划的生成者。

## 2. Topic Watch 是什么

`Topic Watch` 是一个长期监控对象。

它描述：

```text
我要关注什么主题
为什么关注
应该从哪里看
什么情况算有机会
什么证据才算足够
```

示例：

```text
主题：预测市场
关注原因：预测市场经常提前反映政治、金融和公共事件预期，适合做行业洞察和产品承接。
采集规则：关注 X 上预测市场相关 KOL、Polymarket 相关关键词、主流媒体报道和预测市场价格变化。
触发规则：当多个独立来源讨论同一事件，且预测市场价格出现明显变化时，形成内容机会。
```

## 3. 总体流程

```text
运营人员定义 Topic Watch
→ Topic Watch Agent 理解主题规则
→ 生成 Topic Monitoring Plan
→ DataSource Plugin 执行采集
→ RawItem / Signal 入库
→ Topic Aggregation 聚合账号帖子和相关信号
→ 生成 Topic Candidate
→ Topic Watch Agent 基于候选话题和证据判断
→ Opportunity Mining Agent 判断机会或事件
→ Assignment Agent 分发任务
→ Content Generation Agent 生成内容
```

关键边界：

```text
Topic Watch Agent 决定“这个主题应该看什么”
DataSource Plugin 负责“具体怎么抓”
Topic Aggregation 负责“把大量帖子聚合成候选话题”
Opportunity Mining Agent 判断“是否形成机会或事件”
```

大量原始帖子不应该直接进入 Agent。

推荐做法是：

```text
海量帖子 / 搜索结果 / 视频
→ 结构化清洗
→ 去重
→ 时间窗口归并
→ 语义聚类
→ 候选话题压缩
→ Agent 判断
```

这样 Agent 处理的是可追溯的候选话题和证据包，而不是无边界的原始数据流。

## 4. 核心对象

### 4.1 TopicWatch

```ts
interface TopicWatch {
  id: string
  name: string
  description: string
  domains: string[]

  watchIntent: string
  collectionPolicy: string
  triggerPolicy: string
  evidencePolicy: string
  exclusionPolicy?: string

  status: 'active' | 'paused' | 'archived'
  ownerId?: string
  createdAt: string
  updatedAt: string
}
```

字段说明：

- `watchIntent`：为什么关注这个主题。
- `collectionPolicy`：希望如何抓取相关数据。
- `triggerPolicy`：什么情况下形成机会或事件。
- `evidencePolicy`：判断时需要哪些证据。
- `exclusionPolicy`：哪些内容应该排除。

### 4.2 TopicMonitoringPlan

Agent 根据 TopicWatch 生成具体监控计划。

```ts
interface TopicMonitoringPlan {
  id: string
  topicWatchId: string
  version: number
  status: 'draft' | 'active' | 'paused' | 'archived'

  sources: TopicMonitoringSource[]
  triggerRules: TopicTriggerRule[]
  evidenceRequirements: EvidenceRequirement[]
  refreshPolicy: RefreshPolicy

  generatedBy: 'agent' | 'human'
  reason: string
  createdAt: string
  updatedAt: string
}
```

### 4.3 TopicMonitoringSource

```ts
interface TopicMonitoringSource {
  id: string
  sourceType:
    | 'x_search'
    | 'x_account'
    | 'x_trend'
    | 'youtube_search'
    | 'youtube_channel'
    | 'web_search'
    | 'rss'
    | 'prediction_market'
    | 'external'

  platform: string
  query?: string
  accounts?: string[]
  urls?: string[]
  regions?: string[]
  frequency: string
  limit: number
  fields: string[]
  reason: string
}
```

### 4.4 TopicTriggerRule

主题触发规则可以来自自然语言，但需要被 Agent 转换成结构化描述。

```ts
interface TopicTriggerRule {
  id: string
  name: string
  description: string
  conditionText: string
  requiredSources: string[]
  action:
    | 'create_opportunity'
    | 'create_event'
    | 'request_human_review'
    | 'increase_monitoring'
    | 'ignore'
  confidenceRequired: 'high' | 'medium' | 'low'
}
```

MVP 阶段不必把 `conditionText` 编译成固定规则引擎。

可以先由 Agent 基于证据判断是否满足规则，并输出原因和证据引用。

### 4.5 EvidenceRequirement

```ts
interface EvidenceRequirement {
  id: string
  description: string
  minIndependentSources?: number
  requiredSourceTypes?: string[]
  forbiddenSourceTypes?: string[]
  mustIncludeMetrics?: string[]
  reason: string
}
```

### 4.6 TopicCandidate

`TopicCandidate` 是主题下账号帖子、搜索结果、视频或其他 Signal 聚合后的候选话题。

它不是最终事件，也不是最终机会，而是给 Agent 判断的压缩输入。

```ts
interface TopicCandidate {
  id: string
  topicWatchId: string

  title: string
  summary: string
  keywords: string[]
  entities: string[]

  firstSeenAt: string
  lastSeenAt: string

  signalCount: number
  postCount?: number
  accountCount?: number
  sourceTypes: string[]

  representativeSignalIds: string[]
  evidenceRefs: string[]

  metrics: {
    uniqueAuthors?: number
    totalEngagement?: number
    growthRate?: number
    maxViews?: number
  }

  clustering: {
    method: 'embedding' | 'entity_link' | 'url_link' | 'keyword' | 'hybrid'
    confidence: 'high' | 'medium' | 'low'
  }

  status:
    | 'new'
    | 'watching'
    | 'sent_to_agent'
    | 'converted_to_opportunity'
    | 'converted_to_event'
    | 'ignored'

  createdAt: string
  updatedAt: string
}
```

### 4.7 TopicAggregationRun

```ts
interface TopicAggregationRun {
  id: string
  topicWatchId: string
  monitoringRunId?: string
  windowStartAt: string
  windowEndAt: string
  inputSignalCount: number
  candidateCount: number
  method: 'embedding' | 'entity_link' | 'url_link' | 'keyword' | 'hybrid'
  status: 'running' | 'succeeded' | 'failed'
  errorMessage?: string
  createdAt: string
  finishedAt?: string
}
```

## 5. 两类规则

主题追踪规则应该拆成两类。

### 5.1 采集规则

采集规则回答：

```text
这个主题应该去哪里看？
看哪些关键词？
看哪些账号？
看哪些平台？
多久看一次？
每次拿哪些字段？
哪些内容应该排除？
```

示例：

```text
关注 AI 产品发布：
监控 OpenAI、Anthropic、Google DeepMind、Meta AI 官方账号。
搜索关键词包括 model release、API pricing、open source model、benchmark。
排除普通 AI 使用技巧和无行业事实的泛讨论。
```

Agent 应该生成：

```json
{
  "sourceType": "x_account",
  "platform": "x",
  "accounts": ["OpenAI", "AnthropicAI", "GoogleDeepMind", "AIatMeta"],
  "frequency": "1h",
  "limit": 30,
  "fields": ["postId", "authorHandle", "text", "url", "publishedAt", "metrics"],
  "reason": "官方账号最可能发布模型、API、价格和开源相关一手信息。"
}
```

### 5.2 触发规则

触发规则回答：

```text
什么情况下值得形成机会或事件？
```

示例：

```text
当任一官方账号发布模型、API、价格、开源模型相关信息，并且 6 小时内开发者账号出现集中讨论，则形成内容机会。
```

Agent 需要判断它需要的数据：

- 官方账号帖子。
- 开发者讨论。
- 相关搜索结果。
- 已有机会查重。
- 证据引用。

## 6. Agent 如何根据规则取数

Topic Watch Agent 不直接拿固定字段，而是走工具调用。

流程：

```text
读取 TopicWatch
→ 理解 collectionPolicy / triggerPolicy / evidencePolicy
→ 查询 Tool Registry
→ 生成 MonitoringPlan
→ 采集插件按计划执行
→ 汇总 Signal 与 Evidence
→ 判断是否需要补充取数
→ 输出 TopicWatchDecision
```

如果规则写的是：

```text
当预测市场价格变化明显，并且 X 上多个 KOL 同时讨论同一事件，则形成机会。
```

Agent 应该识别需要：

```text
predictionMarket.searchMarkets
x.searchPosts
accounts.findRelevant
opportunity.findSimilar
```

如果系统没有预测市场工具，Agent 应该输出：

```text
无法完整判断，缺少 prediction_market 数据工具。
```

而不是假装已经判断。

## 7. 账号帖子如何形成话题

主题下通常会配置很多账号。

这些账号产生的帖子量可能很大，因此不能把所有帖子直接交给 Agent。

推荐流程：

```text
x.getAccountPosts
→ RawItem
→ Signal(type='post')
→ Topic Aggregation
→ Topic Candidate
→ Topic Watch Agent
```

### 7.1 Topic Aggregation 的职责

Topic Aggregation 负责把大量帖子压缩成候选话题。

它应该做：

- 按时间窗口读取主题相关 Signal。
- 去重相同帖子、转帖、重复链接。
- 提取实体、关键词、URL、作者和来源。
- 根据语义相似度聚类。
- 根据相同链接或相同事件实体合并。
- 选出代表 Signal。
- 生成候选话题标题和摘要。
- 计算基础指标。

它不负责：

- 判断是否值得运营响应。
- 判断是否形成事件。
- 分配账号任务。
- 生成内容正文。

### 7.2 聚合方法

建议使用混合方法：

```text
时间窗口
+ URL / 引用链接归并
+ 实体归并
+ 关键词归并
+ Embedding 语义聚类
+ 少量 LLM 摘要
```

不同方法的作用：

- `URL / 引用链接归并`：同一新闻链接、官方公告或视频链接直接合并。
- `实体归并`：同一公司、人物、产品、项目、市场事件合并。
- `关键词归并`：明显同词或近义词聚合。
- `Embedding 语义聚类`：处理表达不同但语义相同的话题。
- `LLM 摘要`：只用于给聚类结果生成标题、摘要和关键事实，不直接做最终触发判断。

### 7.3 输入

```ts
interface TopicAggregationInput {
  topicWatchId: string
  windowStartAt: string
  windowEndAt: string
  signalTypes: string[]
  maxSignals: number
}
```

### 7.4 输出

```ts
interface TopicAggregationOutput {
  topicWatchId: string
  windowStartAt: string
  windowEndAt: string
  candidates: TopicCandidate[]
}
```

### 7.5 为什么不让同一个 Agent 直接抓热点

不建议让一个 Agent 同时负责：

```text
抓取账号帖子
聚合海量帖子
判断话题
判断机会
分发任务
生成内容
```

原因：

- 输入太大，成本不可控。
- 大模型容易遗漏小但重要的信号。
- 过程不可审计。
- 不容易复盘为什么某个话题被合并或忽略。
- 后续账号数量增加后无法稳定扩展。

正确边界是：

```text
DataSource Plugin：抓原始数据。
Signal Store：保存标准信号。
Topic Aggregation：把帖子聚成候选话题。
Topic Watch Agent：根据主题规则判断候选话题是否触发。
Opportunity Mining Agent：判断是否形成机会或事件。
```

### 7.6 Agent 看到的输入

Topic Watch Agent 不看全量帖子，而是看：

```text
TopicCandidate
+ representativeSignals
+ evidenceRefs
+ metrics
+ missingData
```

也就是说，Agent 看到的是：

- 候选话题标题。
- 候选话题摘要。
- 涉及账号数量。
- 涉及帖子数量。
- 代表帖子链接。
- 关键实体。
- 基础热度指标。
- 可追溯证据。

如果 Agent 判断证据不足，它可以调用工具补充取数，而不是要求聚合层一次性塞入所有内容。

## 8. Agent 可用工具

### 8.1 主题工具

```text
topicWatch.get
topicWatch.findSimilar
topicWatch.getMonitoringPlan
topicWatch.getRecentSignals
topicWatch.getCandidates
```

用途：

- 读取主题定义。
- 查相似主题。
- 查主题监控计划。
- 查主题最近信号。
- 查主题候选话题。

### 8.2 数据源能力工具

```text
dataSource.listCapabilities
dataSource.estimateCost
dataSource.validatePlan
```

用途：

- 查看系统能抓哪些平台。
- 估算采集成本。
- 校验监控计划是否可执行。

### 8.3 平台数据工具

```text
x.searchPosts
x.getAccountPosts
x.getTrending
youtube.searchVideos
youtube.getVideoTranscript
web.search
rss.fetch
predictionMarket.searchMarkets
```

用途：

- 根据主题规则取数据。
- 补充证据。
- 验证触发条件。

### 8.4 机会与事件工具

```text
opportunity.findSimilar
event.findSimilar
evidence.search
```

用途：

- 避免重复机会。
- 查已有事件。
- 查询相关证据。

## 9. Topic Watch Decision

Agent 汇总主题证据后输出结构化判断。

```ts
interface TopicWatchDecision {
  topicWatchId: string
  decision:
    | 'continue_monitoring'
    | 'create_opportunity'
    | 'create_event'
    | 'request_human_review'
    | 'adjust_monitoring_plan'
    | 'ignore'

  title?: string
  summary: string
  matchedRules: string[]
  evidenceRefs: string[]
  missingData: string[]
  riskNotes: string[]
  suggestedPlanChanges?: TopicMonitoringPlanChange[]
  confidence: 'high' | 'medium' | 'low'
}
```

### 9.1 继续监控

适用于：

- 主题相关数据存在，但证据不足。
- 讨论还没有集中。
- 只有单一来源。
- 缺少关键指标。

### 9.2 创建机会

适用于：

- 已经出现内容角度。
- 证据足够支撑运营关注。
- 不一定是明确事实事件，但值得分析和选题。

### 9.3 创建事件

适用于：

- 出现明确事实。
- 多个证据指向同一事件。
- 有足够可信来源。

### 9.4 调整监控计划

适用于：

- 发现新关键词。
- 发现新的关键账号。
- 某个来源无效。
- 讨论转移到新平台。
- 需要提高或降低频率。

## 10. 示例一：预测市场主题

### 10.1 TopicWatch

```json
{
  "name": "预测市场",
  "watchIntent": "发现预测市场中提前反映政治、金融和公共事件预期的内容机会。",
  "collectionPolicy": "关注 Polymarket、Kalshi、预测市场 KOL、主流媒体报道和价格波动。",
  "triggerPolicy": "当某个市场价格明显变化，并且 X 上多个独立账号讨论同一事件时，形成内容机会。",
  "evidencePolicy": "至少需要一个市场数据来源和两个独立讨论来源。"
}
```

### 10.2 Agent 生成采集计划

```json
{
  "sources": [
    {
      "sourceType": "prediction_market",
      "platform": "polymarket",
      "query": "politics OR macro OR crypto",
      "frequency": "2h",
      "limit": 30,
      "fields": ["marketId", "title", "price", "volume", "url", "updatedAt"],
      "reason": "预测市场价格和成交量是该主题的核心变化信号。"
    },
    {
      "sourceType": "x_search",
      "platform": "x",
      "query": "Polymarket OR Kalshi OR prediction market",
      "frequency": "2h",
      "limit": 30,
      "fields": ["postId", "authorHandle", "text", "url", "publishedAt", "metrics"],
      "reason": "X 讨论用于判断市场变化是否扩散到公共讨论。"
    }
  ]
}
```

## 11. 示例二：AI 产品发布主题

### 11.1 TopicWatch

```json
{
  "name": "AI 产品发布",
  "watchIntent": "发现模型、API、价格、开源模型和产品能力变化带来的内容机会。",
  "collectionPolicy": "监控 AI 公司官方账号、开发者讨论、技术媒体和 YouTube 解读视频。",
  "triggerPolicy": "当官方账号发布明确产品变化，并且开发者讨论快速增加时，形成机会。",
  "evidencePolicy": "必须包含一手来源，且至少一个独立讨论来源。"
}
```

### 11.2 Agent 生成采集计划

```json
{
  "sources": [
    {
      "sourceType": "x_account",
      "platform": "x",
      "accounts": ["OpenAI", "AnthropicAI", "GoogleDeepMind", "AIatMeta"],
      "frequency": "1h",
      "limit": 30,
      "fields": ["postId", "authorHandle", "text", "url", "publishedAt", "metrics"],
      "reason": "官方账号是一手产品发布来源。"
    },
    {
      "sourceType": "youtube_search",
      "platform": "youtube",
      "query": "OpenAI Anthropic Gemini model API release",
      "frequency": "6h",
      "limit": 20,
      "fields": ["videoId", "title", "url", "publishedAt", "metrics"],
      "reason": "YouTube 解读视频用于判断是否出现内容扩散和可复刻拆解。"
    }
  ]
}
```

## 12. 数据记录建议

### 12.1 topic_watches

```text
id
name
description
domains
watch_intent
collection_policy
trigger_policy
evidence_policy
exclusion_policy
status
owner_id
created_at
updated_at
```

### 12.2 topic_monitoring_plans

```text
id
topic_watch_id
version
status
sources
trigger_rules
evidence_requirements
refresh_policy
generated_by
reason
created_at
updated_at
```

### 12.3 topic_monitoring_runs

```text
id
topic_watch_id
plan_id
status
started_at
finished_at
raw_item_count
signal_count
error_message
created_at
```

### 12.4 topic_candidates

```text
id
topic_watch_id
title
summary
keywords
entities
first_seen_at
last_seen_at
signal_count
post_count
account_count
source_types
representative_signal_ids
evidence_refs
metrics
clustering
status
created_at
updated_at
```

### 12.5 topic_aggregation_runs

```text
id
topic_watch_id
monitoring_run_id
window_start_at
window_end_at
input_signal_count
candidate_count
method
status
error_message
created_at
finished_at
```

### 12.6 topic_watch_decisions

```text
id
topic_watch_id
decision
title
summary
matched_rules
evidence_refs
missing_data
risk_notes
suggested_plan_changes
confidence
created_at
```

## 13. MVP 方案

MVP 目标：

```text
让一个主题可以用自然语言定义采集策略和触发策略，并由 Agent 生成可执行的监控计划。
```

### 13.1 输入

支持运营人员创建：

- 主题名称。
- 关注原因。
- 采集策略。
- 触发策略。
- 证据要求。
- 排除规则。

### 13.2 输出

Agent 输出：

- 监控平台。
- 关键词。
- 账号列表。
- 采集频率。
- 字段选择。
- 触发规则结构化描述。
- 主题候选话题。
- 缺失工具说明。

### 13.3 工具限制

MVP 只允许读工具：

```text
dataSource.listCapabilities
x.searchPosts
x.getAccountPosts
youtube.searchVideos
web.search
opportunity.findSimilar
event.findSimilar
```

### 13.4 动作限制

```text
默认需要人工确认监控计划
不直接发布内容
不直接创建账号任务
不调用未注册外部来源
不无限扩大关键词和账号范围
```

## 14. 后续演进

### 阶段一：主题定义与监控计划

支持运营人员定义 TopicWatch。

Agent 生成 MonitoringPlan。

### 阶段二：采集执行

DataSource Plugin 根据 MonitoringPlan 执行采集。

采集结果进入 RawItem 和 Signal。

### 阶段三：账号帖子聚合成候选话题

Topic Aggregation 将主题下账号帖子和相关 Signal 聚合成 TopicCandidate。

Agent 不直接处理全量原始帖子。

### 阶段四：主题证据汇总

Agent 汇总主题相关 Signal，判断是否需要补充数据。

### 阶段五：机会与事件触发

Agent 根据 triggerPolicy 和 evidencePolicy 输出：

- 创建机会。
- 创建事件。
- 继续观察。
- 调整监控计划。
- 人工复核。

### 阶段六：策略反馈

根据后续内容表现优化：

- 主题关键词。
- 关键账号。
- 平台权重。
- 触发规则。
- 证据要求。

## 15. 安全边界

必须限制：

- 主题监控计划必须可审计。
- 可用数据源必须来自白名单。
- 关键词扩展需要范围限制。
- 账号扩展需要数量限制。
- 工具调用次数需要预算。
- 采集频率需要上限。
- 输出必须引用证据。
- 缺失数据必须如实显示。
- Agent 不直接读取无边界的全量原始帖子。

必须禁止：

- Agent 访问未注册平台。
- Agent 无限扩展关键词。
- Agent 无限扩展账号列表。
- Agent 在证据不足时强行创建事件。
- Agent 忽略排除规则。
- Agent 绕过人工确认创建高风险动作。

## 16. 成功标准

MVP 成功后，应满足：

- 一个主题可以定义不同采集规则。
- 一个主题可以定义不同触发规则。
- Agent 能根据规则生成可执行采集计划。
- Agent 能说明为什么需要某个数据源。
- Agent 能按需选择字段。
- 缺失工具时能明确说明。
- 账号帖子能先聚合成 TopicCandidate。
- Agent 处理候选话题和证据包，而不是全量帖子。
- 采集结果能进入统一 Signal。
- 主题证据能进入机会挖掘 Agent。
- 规则变化不要求新增固定后端字段。

## 17. 核心结论

主题追踪应该从：

```text
固定关键词 + 固定账号 + 固定阈值
```

升级为：

```text
Topic Watch
→ Topic Watch Agent
→ Monitoring Plan
→ DataSource Plugin
→ Signal
→ Topic Aggregation
→ Topic Candidate
→ Opportunity Mining Agent
```

这样不同主题可以有不同抓取规则、触发规则和证据标准，系统也能根据规则按需获取数据，而不是把所有主题塞进同一套固定逻辑。
