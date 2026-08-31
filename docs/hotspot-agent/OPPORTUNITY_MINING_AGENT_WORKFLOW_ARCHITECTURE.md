# 机会挖掘 Agent 工作流架构设计

## 1. 核心目标

本设计解决的问题是：

```text
形成事件 / 挖掘机会的工作流不应该只能处理后端预先塞好的固定字段。
它应该能根据目标，自己判断还需要哪些数据、哪些字段，并在受控范围内调用工具补充证据。
```

理想效果类似：

```text
给 Agent 一个初始信号或问题
→ Agent 判断需要哪些数据
→ Agent 选择工具和字段
→ 系统执行工具
→ 工具结果进入证据上下文
→ Agent 判断证据是否足够
→ 不足则继续取数
→ 足够则输出机会、事件、洞察或忽略理由
```

这不是传统的固定规则工作流，而是：

```text
受控 Agent Loop
```

## 2. 固定工作流模式的问题

如果事件形成使用固定工作流，通常会变成：

```text
后端准备固定输入
→ Workflow 根据固定字段判断
→ 输出 create_event / update_event / ignore
```

它的问题是：

- Workflow 只能使用输入里已有字段。
- 它不知道本次判断还缺什么数据。
- 它不能主动查询更多来源。
- 它不能按需选择字段。
- 它无法判断“证据不足，应该继续取数”。
- 每新增一种判断方式，都要后端提前计算新字段。
- 最终变成不断补规则、补字段、补约束。

这类系统本质上是：

```text
提示词版规则引擎
```

而不是 Agent。

## 3. 新系统要解决什么

机会挖掘 Agent 不是只判断“是否创建 Event”，而是判断：

```text
一个信号是否构成内容机会？
它是什么类型的机会？
需要哪些证据支持？
是否已有相似机会？
是否值得运营人员关注？
是否适合结合产品？
是否需要进一步人工判断？
```

最终输出不一定是 Event，也可能是：

- 热点事件。
- 内容机会。
- 爆款拆解。
- 行业洞察。
- 竞品观察。
- Meme / 热梗机会。
- 未来事件预热机会。
- 忽略原因。
- 人工复核请求。

## 4. 核心概念

### 4.1 Goal

`Goal` 是 Agent 本次要完成的目标。

```ts
interface AgentGoal {
  id: string
  type:
    | 'detect_opportunity'
    | 'form_event'
    | 'analyze_hot_topic'
    | 'analyze_viral_content'
    | 'find_product_angle'
  instruction: string
  initialSignal?: Signal
  constraints: AgentConstraints
}
```

示例：

```json
{
  "type": "detect_opportunity",
  "instruction": "判断 X 热搜 Polymarket 是否值得形成内容机会，并给出证据和产品承接角度。"
}
```

### 4.2 Tool Registry

`Tool Registry` 告诉 Agent 本次运行有哪些工具可用。

工具定义必须让模型能理解：

- 工具能解决什么问题。
- 需要什么参数。
- 可以返回什么字段。
- 什么时候适合调用。
- 调用成本和限制是什么。

```ts
interface AgentToolDefinition {
  name: string
  description: string
  category:
    | 'signal'
    | 'x'
    | 'youtube'
    | 'search'
    | 'opportunity'
    | 'event'
    | 'account'
    | 'metric'
    | 'content'

  inputSchema: JsonSchema
  outputSchema: JsonSchema

  fieldSelection?: {
    supported: boolean
    allowedFields: string[]
    defaultFields: string[]
  }

  examples: {
    goal: string
    arguments: unknown
  }[]

  limits: {
    maxCallsPerRun: number
    timeoutMs: number
    costLevel: 'low' | 'medium' | 'high'
  }
}
```

### 4.3 Evidence Memory

`Evidence Memory` 是 Agent 已经拿到的证据。它不只是原始工具返回，而是经过整理后可引用的证据项。

```ts
interface EvidenceItem {
  id: string
  sourceTool: string
  sourceType: string
  sourceItemId?: string
  claim: string
  text?: string
  url?: string
  author?: string
  publishedAt?: string
  observedAt: string
  metrics?: Record<string, number | null>
  confidence: 'high' | 'medium' | 'low'
  rawRef?: string
}
```

最终结论必须引用 `EvidenceItem.id`，不能凭空生成事实。

### 4.4 Agent State

Agent 每一步都基于运行状态决策。

```ts
interface AgentState {
  goal: AgentGoal
  availableTools: AgentToolDefinition[]
  evidence: EvidenceItem[]
  toolCalls: AgentToolCallRecord[]
  budget: AgentBudget
  messages: AgentMessage[]
}
```

### 4.5 Final Decision

最终输出是结构化判断，而不是自由文本。

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

## 5. Agent Loop 执行流程

### 5.1 总流程

```text
创建 AgentRun
→ 加载 Goal
→ 加载可用工具
→ 加载初始 Signal
→ Agent 生成下一步动作
→ 如果是 tool_call，执行工具并保存证据
→ 如果是 final_decision，校验并结束
→ 如果预算耗尽，输出 request_human_review
```

伪代码：

```ts
while (!run.finished) {
  const output = await agent.next({
    goal,
    tools,
    evidence,
    budget,
    constraints,
  })

  if (output.type === 'tool_call') {
    validateToolCall(output)
    const result = await executeTool(output)
    const evidenceItems = normalizeToolResult(result)
    evidence.add(evidenceItems)
    continue
  }

  if (output.type === 'final_decision') {
    validateDecision(output)
    finishRun(output)
    break
  }
}
```

### 5.2 每一步输出协议

Agent 每一步只能输出两种结构。

第一种：请求工具。

```ts
interface AgentToolCallRequest {
  type: 'tool_call'
  toolName: string
  reason: string
  arguments: unknown
  expectedFields: string[]
}
```

第二种：最终判断。

```ts
interface AgentFinalDecisionOutput {
  type: 'final_decision'
  decision: OpportunityMiningDecision
}
```

Agent 不允许输出“我已经查过”这种未执行工具的说法。

## 6. 按需取字段如何实现

每个工具支持 `fields` 参数，让 Agent 明确告诉系统需要哪些字段。

例如搜索 X 帖子：

```json
{
  "type": "tool_call",
  "toolName": "x.searchPosts",
  "reason": "需要确认该热搜背后是否有具体事件，而不是泛话题。",
  "arguments": {
    "query": "Polymarket",
    "sinceHours": 6,
    "limit": 20,
    "fields": [
      "postId",
      "authorHandle",
      "text",
      "url",
      "publishedAt",
      "metrics"
    ]
  },
  "expectedFields": [
    "帖子正文",
    "作者",
    "链接",
    "发布时间",
    "互动指标"
  ]
}
```

查询相似机会：

```json
{
  "type": "tool_call",
  "toolName": "opportunity.findSimilar",
  "reason": "需要避免重复创建相似机会。",
  "arguments": {
    "query": "Polymarket 预测市场讨论升温",
    "fields": [
      "id",
      "title",
      "status",
      "createdAt",
      "evidenceSummary"
    ]
  },
  "expectedFields": [
    "已有机会标题",
    "状态",
    "证据摘要"
  ]
}
```

这样字段选择成为 Agent 决策的一部分，而不是后端提前写死。

## 7. 可用工具类型

### 7.1 Signal 工具

```text
signal.search
signal.getRecent
signal.getBySource
signal.getRelated
```

用途：

- 查最近类似信号。
- 查某关键词在不同平台的信号。
- 查某个来源对象的历史表现。

### 7.2 X 工具

```text
x.searchPosts
x.getTrending
x.getAccountPosts
x.getPostMetrics
```

用途：

- 判断实时讨论热度。
- 找代表帖。
- 看是否多个独立账号讨论。
- 看帖子的互动是否异常。

### 7.3 YouTube 工具

```text
youtube.searchVideos
youtube.getTrendingVideos
youtube.getVideoTranscript
youtube.getVideoMetrics
```

用途：

- 判断话题是否在视频平台同步升温。
- 拆解爆款视频。
- 找可复刻内容机制。

### 7.4 Opportunity / Event 工具

```text
opportunity.findSimilar
opportunity.getById
event.findSimilar
event.getById
```

用途：

- 避免重复创建机会。
- 判断是更新已有对象还是新建。
- 读取历史上下文。

### 7.5 Account / Product 工具

```text
accounts.getPersonas
accounts.getPerformanceBaseline
product.getActiveProfile
```

用途：

- 判断适合哪个账号。
- 判断产品能否自然承接。
- 避免不适合的人设或产品角度。

### 7.6 Web / Search 工具

```text
search.web
rss.fetchArticle
news.search
```

用途：

- 查外部事实来源。
- 找反证。
- 确认是否只是社交平台噪音。

## 8. 预算与停止条件

Agent 不能无限取数，必须有预算。

```ts
interface AgentBudget {
  maxToolCalls: number
  usedToolCalls: number
  remainingToolCalls: number
  maxRunMs: number
  startedAt: string
  maxTokens?: number
  maxCostUsd?: number
}
```

停止条件：

- 已经有足够证据形成判断。
- 预算耗尽。
- 工具连续失败。
- 证据冲突，需要人工判断。
- 找到已有相似机会，应更新而不是新建。
- 输入本身无价值，应忽略。

预算耗尽时，不能硬编结论，应输出：

```text
request_human_review
```

并说明缺少哪些数据。

## 9. 证据规则

Agent 的最终判断必须遵守：

- 所有事实必须来自工具结果或初始输入。
- 每个核心结论必须引用 evidenceRefs。
- 不确定的内容必须写入 `missingData` 或 `riskNotes`。
- 工具失败必须记录，不得假装已经获取。
- 同一来源的多个帖子不能伪装成多个独立来源。
- 不能因为热度高就自动判定值得做内容。
- 不能因为已有相似机会仍重复创建。

## 10. 完整示例

### 10.1 输入目标

```json
{
  "type": "detect_opportunity",
  "instruction": "判断 X 热搜 Polymarket 是否值得形成内容机会。",
  "initialSignal": {
    "platform": "x",
    "sourceType": "trend",
    "title": "Polymarket",
    "region": "United States",
    "observedAt": "2026-08-24T10:00:00Z"
  }
}
```

### 10.2 第一步：查 X 帖子

```json
{
  "type": "tool_call",
  "toolName": "x.searchPosts",
  "reason": "需要确认热搜背后是泛话题还是具体讨论。",
  "arguments": {
    "query": "Polymarket",
    "sinceHours": 6,
    "limit": 20,
    "fields": ["postId", "authorHandle", "text", "url", "publishedAt", "metrics"]
  },
  "expectedFields": ["正文", "作者", "链接", "时间", "互动指标"]
}
```

### 10.3 第二步：查 YouTube

```json
{
  "type": "tool_call",
  "toolName": "youtube.searchVideos",
  "reason": "需要确认该话题是否在视频平台同步升温。",
  "arguments": {
    "query": "Polymarket",
    "publishedAfterHours": 168,
    "limit": 10,
    "fields": ["videoId", "title", "url", "publishedAt", "metrics"]
  },
  "expectedFields": ["视频标题", "链接", "发布时间", "播放量"]
}
```

### 10.4 第三步：查相似机会

```json
{
  "type": "tool_call",
  "toolName": "opportunity.findSimilar",
  "reason": "需要避免重复创建相似机会。",
  "arguments": {
    "query": "Polymarket 预测市场讨论升温",
    "fields": ["id", "title", "status", "createdAt", "evidenceSummary"]
  },
  "expectedFields": ["已有机会", "状态", "证据摘要"]
}
```

### 10.5 最终输出

```json
{
  "type": "final_decision",
  "decision": {
    "decision": "create_opportunity",
    "title": "Polymarket 预测市场话题在 X 上升温",
    "opportunityType": "industry_topic",
    "summary": "Polymarket 在美国 X 热搜中出现，相关讨论集中在预测市场与政治事件的关系。",
    "whyNow": "过去 6 小时多个账号围绕预测市场和选举讨论，具备短期内容窗口。",
    "whyItMatters": "该话题连接政治、金融和预测市场，适合解释信息差和市场情绪。",
    "productAngles": [
      "用产品监控预测市场话题从小圈层扩散到公共讨论的过程",
      "用事件追踪解释哪些信号能提前发现内容机会"
    ],
    "contentWindow": "24-48 小时",
    "confidence": "medium",
    "evidenceRefs": ["ev_001", "ev_002"],
    "missingData": ["缺少搜索趋势数据", "YouTube 暂未发现强相关爆款视频"],
    "riskNotes": ["只能确认社交讨论升温，尚不能确认是否有明确事实事件。"]
  }
}
```

## 11. Agent 工作流与普通 Workflow 的区别

普通 Workflow：

```text
输入固定
字段固定
规则固定
输出固定
```

Agent Workflow：

```text
目标固定
工具受控
字段按需
证据累积
结论结构化
```

对比：

| 维度 | 普通 Workflow | Agent Workflow |
| --- | --- | --- |
| 输入 | 后端提前准备 | 初始信号 + 可用工具 |
| 数据 | 固定字段 | 按需获取 |
| 字段 | 后端写死 | Agent 通过 fields 指定 |
| 判断 | 一次性判断 | 多轮补证据 |
| 输出 | 固定命令 | 机会 / 事件 / 洞察 / 忽略 |
| 风险 | 规则不断膨胀 | 需要预算和权限控制 |
| 审计 | 只看最终输入输出 | 每次工具调用都可追踪 |

## 12. 和 LangGraph / OpenClaw 的关系

### 12.1 LangGraph 适合做什么

LangGraph 适合做 Agent Loop 的执行引擎：

- 状态机。
- 条件分支。
- 工具调用循环。
- 中断恢复。
- 人工确认节点。
- 多步推理过程追踪。

可以把它封装成：

```ts
interface AgentWorkflowEngine {
  run(input: AgentRunInput): Promise<AgentRunResult>
}
```

业务系统不要直接到处依赖 LangGraph。

### 12.2 OpenClaw 适合借鉴什么

OpenClaw 更适合借鉴：

- 工具注册方式。
- 插件化能力。
- Agent 如何知道可用工具。
- 工具调用协议。
- 权限和策略控制。

但核心业务对象仍应自建：

- Signal
- Opportunity
- Event
- Insight
- ProductAngle
- Evidence

## 13. MVP 方案

MVP 先把机会挖掘 Agent 做成只读分析与建议输出，不直接执行高风险写入动作。

### 13.1 输入

只支持：

```text
一个初始 Signal
```

例如：

- X 热搜信号。
- 主题圈候选。
- YouTube 爆款视频。

### 13.2 允许工具

MVP 只允许读工具：

```text
signal.search
x.searchPosts
youtube.searchVideos
opportunity.findSimilar
event.findSimilar
product.getActiveProfile
```

### 13.3 限制

```text
maxToolCalls = 5
maxRunMs = 90000
不允许直接写库
不允许自动发布
不允许自动分配账号任务
```

### 13.4 输出

只输出 `OpportunityCandidate`：

```ts
interface OpportunityCandidate {
  title: string
  type: string
  summary: string
  whyNow: string
  whyItMatters: string
  evidenceRefs: string[]
  productAngles: string[]
  recommendedAction:
    | 'observe'
    | 'create_event'
    | 'create_content_brief'
    | 'ignore'
    | 'human_review'
  confidence: 'high' | 'medium' | 'low'
}
```

### 13.5 评估方式

运营工作台展示：

```text
Agent 挖掘结果
证据引用
缺失数据
风险说明
人工评价
```

先验证 Agent 的分析质量，再决定哪些低风险动作可以自动执行。

## 14. 后续演进

### 阶段一：只读分析

Agent 只分析，不写业务表。

### 阶段二：人工确认

Agent 可以建议：

- 创建机会。
- 创建事件。
- 生成内容 brief。

但必须人工确认。

### 阶段三：半自动执行

高置信度、低风险的机会可以自动创建 Opportunity，但不自动发布。

### 阶段四：多 Agent 分工

可以拆成：

- Research Agent：按需取数。
- Evidence Agent：整理证据。
- Opportunity Agent：判断机会。
- Product Angle Agent：生成产品承接角度。
- Review Agent：检查风险和重复。

## 15. 安全边界

必须限制：

- 可用工具白名单。
- 工具调用次数。
- 单次工具超时。
- 总运行耗时。
- 字段范围。
- 查询时间窗口。
- 查询账号范围。
- 输出 schema。
- 写操作权限。

必须禁止：

- Agent 直接执行 SQL。
- Agent 调用任意未注册 URL。
- Agent 直接发布内容。
- Agent 直接写业务表。
- Agent 输出没有证据引用的事实判断。
- Agent 超预算后继续推理。

## 16. 成功标准

MVP 成功后，应满足：

- Agent 能根据目标选择工具。
- Agent 能按需指定字段。
- Agent 能基于工具结果继续判断是否补数据。
- Agent 能输出结构化机会判断。
- 每个核心结论都有证据引用。
- 工具失败和数据缺失会如实显示。
- 不需要为每条新规则继续写死后端字段。
- 运营人员可以基于 Agent 输出做确认和反馈。

## 17. 核心结论

形成事件规则不应该继续沿着固定阈值和固定字段扩展。

系统应该从：

```text
Event Formation Rule
```

升级为：

```text
Opportunity Mining Agent Workflow
```

也就是：

```text
目标驱动
工具可选
字段按需
证据累积
结论结构化
过程可审计
动作受控制
```

这样系统才能像真正的 Agent 一样，在不同问题下知道自己需要什么数据，而不是永远等待后端提前把字段算好。
