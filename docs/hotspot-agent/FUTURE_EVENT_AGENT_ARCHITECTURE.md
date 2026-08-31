# 未来事件 Agent 架构设计

## 1. 核心目标

未来事件不是普通数据源。

它的核心价值不是“采集到了什么已经发生的热点”，而是：

```text
提前发现未来可能发生、可能被讨论、可能值得运营准备内容的事件。
```

未来事件系统要解决的问题是：

- 未来事件来源不固定。
- 不同事件需要监控的数据不同。
- 预热窗口不同。
- 事件发生前、发生中、发生后关注点不同。
- 不应该所有未来事件都套同一套抓取规则。

因此未来事件需要 Agent 参与。

推荐拆成两个 Agent：

```text
Future Event Discovery Agent
+ Future Event Monitoring Agent
```

分别负责：

```text
发现未来事件
生成未来事件监控计划
```

## 2. 为什么未来事件不能只当成普通数据源

普通数据源通常是：

```text
平台
→ 定时采集
→ 标准化
→ 生成 Signal
```

例如：

- X 热搜榜。
- X 指定账号帖子。
- YouTube 视频。
- 搜索结果。

但未来事件更复杂：

```text
未来事件本身可能来自很多地方
未来事件确认后还需要判断应该监控哪些数据
```

例如“美联储议息会议”需要监控：

- 官方公告。
- 经济数据。
- 金融媒体。
- 经济学家账号。
- 预测市场。
- X 讨论。
- YouTube 解读视频。

而“某产品发布会”可能需要监控：

- 官方账号。
- 创始人账号。
- 竞品账号。
- 科技媒体。
- YouTube 测评视频。
- Reddit / 社区讨论。

所以未来事件不只是一个采集插件，而是一类需要规划的业务对象。

## 3. 总体流程

推荐流程：

```text
未来事件来源
→ Future Event Discovery Agent
→ FutureEventCandidate
→ 人工确认 / 自动确认
→ FutureEvent
→ Future Event Monitoring Agent
→ MonitoringPlan
→ DataSource Plugin 执行采集
→ Signal Store
→ Opportunity Mining Agent
→ Assignment Agent
→ Content Generation Agent
```

也就是：

```text
Agent 负责判断未来事件和监控计划
插件负责执行具体采集
机会挖掘 Agent 负责判断是否形成机会
```

## 4. Future Event Discovery Agent

### 4.1 职责

未来事件发现 Agent 负责回答：

```text
未来有哪些值得运营关注的事件？
```

它不负责：

- 直接创建内容任务。
- 直接生成正文。
- 直接发布。
- 直接无限抓取数据。

它输出候选事件，供人工确认或规则确认。

### 4.2 可用来源

未来事件来源可以包括：

- 官方日历。
- 行业会议日程。
- 经济数据发布时间。
- 选举日程。
- 体育、娱乐、科技大事件。
- 产品发布会。
- 财报日历。
- 预测市场事件。
- 新闻日历。
- 搜索结果。
- 运营人员手动录入。
- 外部系统同步。

这些来源不应该写死在 Agent 内部，而应该通过工具暴露。

### 4.3 输入

```ts
interface FutureEventDiscoveryGoal {
  id: string
  instruction: string
  domains: string[]
  timeWindow: {
    startAt: string
    endAt: string
  }
  constraints: FutureEventDiscoveryConstraints
}
```

示例：

```json
{
  "instruction": "寻找未来 30 天内值得 Crypto、预测市场、宏观金融相关账号提前准备内容的事件。",
  "domains": ["crypto", "prediction_market", "macro_finance"],
  "timeWindow": {
    "startAt": "2026-08-24T00:00:00Z",
    "endAt": "2026-09-23T23:59:59Z"
  }
}
```

### 4.4 输出

```ts
interface FutureEventCandidate {
  id: string
  title: string
  eventType:
    | 'conference'
    | 'economic_data'
    | 'election'
    | 'product_launch'
    | 'earnings'
    | 'sports'
    | 'entertainment'
    | 'industry_event'
    | 'prediction_market'
    | 'other'

  scheduledAt?: string
  timeRange?: {
    startAt: string
    endAt: string
  }

  domains: string[]
  summary: string
  whyItMatters: string
  expectedDiscussionWindow: string
  recommendedMonitoringStartAt: string
  recommendedMonitoringEndAt: string
  suggestedKeywords: string[]
  suggestedAccounts: string[]
  suggestedPlatforms: string[]
  evidenceRefs: string[]
  confidence: 'high' | 'medium' | 'low'
  missingData: string[]
  riskNotes: string[]
}
```

## 5. Future Event Monitoring Agent

### 5.1 职责

未来事件监控 Agent 负责回答：

```text
一个已经确认的未来事件，应该从什么时候开始监控、监控哪些平台、哪些关键词、哪些账号、用什么频率、触发什么后续动作？
```

它不是直接采集器。

它输出：

```text
MonitoringPlan
```

然后由数据采集插件执行。

### 5.2 输入

```ts
interface FutureEventMonitoringGoal {
  id: string
  futureEventId: string
  instruction: string
  constraints: FutureEventMonitoringConstraints
}
```

### 5.3 输出

```ts
interface FutureEventMonitoringPlan {
  id: string
  futureEventId: string
  monitoringStartAt: string
  monitoringEndAt: string
  phases: FutureEventMonitoringPhase[]
  triggerRules: FutureEventTriggerRule[]
  expectedContentAngles: string[]
  evidenceRefs: string[]
  confidence: 'high' | 'medium' | 'low'
  missingData: string[]
  riskNotes: string[]
}
```

### 5.4 监控阶段

未来事件通常分阶段监控。

```ts
interface FutureEventMonitoringPhase {
  name:
    | 'preheat'
    | 'near_event'
    | 'live_window'
    | 'post_event'

  startAt: string
  endAt: string

  sources: FutureEventMonitoringSource[]
}
```

推荐阶段：

```text
preheat：提前预热期
near_event：临近事件期
live_window：事件发生窗口
post_event：事件后复盘窗口
```

### 5.5 监控来源

```ts
interface FutureEventMonitoringSource {
  sourceType:
    | 'x_trend'
    | 'x_search'
    | 'x_account'
    | 'youtube_search'
    | 'youtube_channel'
    | 'web_search'
    | 'rss'
    | 'prediction_market'
    | 'official_page'

  platform: string
  query?: string
  accounts?: string[]
  urls?: string[]
  frequency: string
  fields: string[]
  reason: string
}
```

关键点：

```text
Monitoring Agent 判断应该看什么
DataSource Plugin 执行怎么抓
```

## 6. 触发规则

未来事件的触发规则不应该只依赖固定阈值。

可以让 Agent 输出结构化触发规则：

```ts
interface FutureEventTriggerRule {
  id: string
  name: string
  description: string
  action:
    | 'create_opportunity'
    | 'create_event'
    | 'request_human_review'
    | 'increase_monitoring_frequency'
    | 'generate_content_brief'
  conditionText: string
  requiredSignals: string[]
}
```

示例：

```json
{
  "name": "临近事件讨论升温",
  "description": "事件发生前 48 小时内，如果多个独立来源开始讨论该事件，则生成内容机会。",
  "action": "create_opportunity",
  "conditionText": "事件发生前 48 小时内，至少 3 个独立来源出现高相关讨论。",
  "requiredSignals": ["x_search", "x_account", "web_search"]
}
```

MVP 可以先让触发规则用于人工可读和 Agent 判断，不必马上做复杂规则引擎。

## 7. Agent 可用工具

### 7.1 发现工具

```text
calendar.searchEvents
search.web
news.search
rss.fetchCalendar
predictionMarket.searchMarkets
externalFutureEvent.list
manualFutureEvent.list
```

用途：

- 查未来事件来源。
- 查官方日历。
- 查行业会议。
- 查预测市场。
- 查外部系统同步事件。

### 7.2 事件工具

```text
futureEvent.findSimilar
futureEvent.getById
futureEvent.getRecent
```

用途：

- 避免重复创建未来事件。
- 查询已记录的未来事件。
- 判断是否更新已记录事件。

### 7.3 监控规划工具

```text
dataSource.listCapabilities
accounts.findRelevant
product.getActiveProfile
opportunity.findSimilar
```

用途：

- 查看系统具备哪些采集能力。
- 找相关账号。
- 判断产品承接方向。
- 避免重复机会。

## 8. 和数据采集插件的关系

未来事件 Agent 不直接写具体采集逻辑。

它只输出监控计划：

```text
MonitoringPlan
```

采集插件执行计划：

```text
DataSource Plugin
→ collect(input)
→ RawItem
→ Signal
```

例如：

```text
Future Event Monitoring Agent:
  需要监控 X 上 "FOMC rate decision" 关键词，每 2 小时一次。

X Search Plugin:
  实际调用 X 搜索接口，保存原始帖子和 Signal。
```

这样职责清晰：

- Agent 决定看什么。
- Plugin 决定怎么抓。
- Scheduler 决定什么时候跑。
- Signal Store 保存结果。

## 9. 和机会挖掘 Agent 的关系

未来事件监控产生的 Signal 会进入机会挖掘 Agent。

机会挖掘 Agent 判断：

- 是否已经出现内容机会。
- 是否应该形成 Event。
- 是否应该生成内容 brief。
- 是否应该继续观察。
- 是否需要人工复核。

未来事件 Agent 不直接替代机会挖掘 Agent。

两者边界是：

```text
Future Event Agent：提前发现与规划监控。
Opportunity Mining Agent：基于监控结果判断机会。
```

## 10. 和任务分发 Agent 的关系

未来事件确认后，可能在不同阶段触发不同任务。

例如：

```text
预热期：生成背景解释内容。
临近事件：生成预期和看点内容。
发生中：生成快讯内容。
发生后：生成复盘分析内容。
```

这些任务仍由 Assignment Agent 分配。

Future Event Agent 不直接决定哪个账号发布。

## 11. 数据记录建议

### 11.1 future_events

记录已确认的未来事件。

```text
id
title
event_type
scheduled_at
start_at
end_at
domains
summary
why_it_matters
status
created_from
confidence
created_at
updated_at
```

### 11.2 future_event_candidates

记录 Agent 发现但未确认的候选事件。

```text
id
title
event_type
scheduled_at
time_range
domains
summary
why_it_matters
recommended_monitoring_start_at
recommended_monitoring_end_at
suggested_keywords
suggested_accounts
suggested_platforms
evidence_refs
confidence
status
created_at
```

### 11.3 future_event_monitoring_plans

记录监控计划。

```text
id
future_event_id
monitoring_start_at
monitoring_end_at
phases
trigger_rules
expected_content_angles
confidence
status
created_at
updated_at
```

### 11.4 future_event_monitoring_runs

记录计划执行情况。

```text
id
future_event_id
plan_id
phase
status
started_at
finished_at
raw_item_count
signal_count
error_message
created_at
```

## 12. MVP 方案

MVP 不做完全自动发现，先把监控规划能力做稳。

推荐做：

```text
人工录入 / 外部同步 FutureEvent
→ Future Event Monitoring Agent 生成监控计划
→ 人工确认监控计划
→ 采集插件执行
→ Signal 进入机会挖掘 Agent
```

也就是说：

- Discovery Agent 可以作为候选发现能力。
- Monitoring Agent 优先实现。
- 先解决“一个未来事件应该看什么数据”的问题。

### 12.1 MVP 输入

```text
一个已确认 FutureEvent
```

### 12.2 MVP 输出

```text
FutureEventMonitoringPlan
```

### 12.3 MVP 工具

```text
dataSource.listCapabilities
accounts.findRelevant
search.web
product.getActiveProfile
futureEvent.findSimilar
```

### 12.4 MVP 限制

```text
maxToolCalls = 5
maxRunMs = 90000
默认需要人工确认
不直接创建内容任务
不直接发布
```

## 13. 后续演进

### 阶段一：人工录入未来事件，Agent 生成监控计划

运营人员录入事件名称和时间。

Agent 输出：

- 监控关键词。
- 相关账号。
- 相关平台。
- 监控阶段。
- 触发规则。

### 阶段二：外部来源同步

接入：

- 官方日历。
- 行业会议日历。
- 财报日历。
- 预测市场。
- 外部运营系统。

这些来源先作为 FutureEventCandidate。

### 阶段三：Discovery Agent 自动发现候选

Agent 定期查找未来事件候选。

人工确认后进入 FutureEvent。

### 阶段四：自动调整监控计划

如果事件临近、讨论升温或来源失败，Agent 可以建议：

- 提高监控频率。
- 增加关键词。
- 增加账号。
- 延长复盘窗口。

### 阶段五：效果反馈

根据未来事件相关内容表现，优化：

- 提前多久开始监控。
- 哪些来源最有效。
- 哪些事件类型值得做。
- 哪些预热角度表现更好。

## 14. 安全边界

必须限制：

- 可用来源白名单。
- 工具调用次数。
- 查询时间窗口。
- 外部 URL 范围。
- 监控频率上限。
- 单个事件最大监控来源数。
- 自动创建任务权限。
- 自动发布权限。

必须禁止：

- Agent 直接抓取任意未知网站。
- Agent 直接发布内容。
- Agent 直接创建大量监控任务。
- Agent 在证据不足时确认高置信度事件。
- Agent 为未知时间事件生成精确倒计时。
- Agent 忽略数据缺失或来源失败。

## 15. 成功标准

MVP 成功后，应满足：

- 未来事件可以独立于实时热点管理。
- Agent 能根据事件类型判断该监控什么。
- Agent 能输出结构化监控计划。
- 监控计划能被人工确认。
- 采集插件能根据计划执行。
- 采集结果能变成 Signal。
- Signal 能进入机会挖掘 Agent。
- 未来事件不会直接和内容任务耦合。

## 16. 核心结论

未来事件应该作为 V2 的独立能力。

它不是简单数据源，也不是内容生成入口，而是：

```text
提前发现未来事件
规划事件前后的监控策略
把监控结果转化为机会挖掘输入
```

推荐最终形态：

```text
Future Event Discovery Agent
→ FutureEventCandidate
→ FutureEvent
→ Future Event Monitoring Agent
→ MonitoringPlan
→ DataSource Plugin
→ Signal
→ Opportunity Mining Agent
```

这样未来事件可以支持不同来源、不同事件类型和不同监控策略，而不需要继续写死规则。
