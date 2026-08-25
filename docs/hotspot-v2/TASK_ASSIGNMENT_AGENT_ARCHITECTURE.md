# 任务分发 Agent 架构设计

## 1. 核心目标

任务分发要解决的问题不是简单地把事件分配给固定账号类型，而是：

```text
给定一个机会或事件，系统需要判断哪些运营账号适合承接、分别从什么角度承接、是否存在重复任务或发布风险。
```

账号来源也不应该被写死。运营账号可能来自：

- 本地系统配置。
- 外部账号管理系统。
- CRM / 内容中台。
- 平台账号接口。
- 后续人工临时导入。

因此第三步应该从固定代码分配升级为：

```text
Task Assignment Agent
```

它的职责是：

```text
机会 / 事件
→ 获取可用账号
→ 理解账号人设和规则
→ 检查历史任务和重复风险
→ 判断适合的账号与角度
→ 输出结构化任务分发决策
```

## 2. 固定分发方式的问题

如果任务分发使用固定映射，通常会这样做：

```text
事件类型
→ 固定账号类型
→ 创建任务
```

这种方式的问题是：

- 账号类型写死后，很难适配新增账号。
- 一个账号可能有多个人设维度，不能只靠类型判断。
- 同一个事件可能适合多个账号，但每个账号角度不同。
- 不知道账号近期是否已经发布过相似内容。
- 不知道外部账号系统里是否有更合适的账号。
- 新增渠道或账号来源时，需要改任务分发代码。
- 运营人员调整账号策略后，系统不能动态理解。

本质上，任务分发不是一个固定映射问题，而是一个决策问题。

## 3. 任务分发 Agent 的边界

任务分发 Agent 只负责：

- 判断是否需要分发任务。
- 选择适合的运营账号。
- 给每个账号定义内容目标。
- 给每个账号定义承接角度。
- 给每个账号附加内容约束。
- 说明为什么选择或跳过某个账号。
- 检查重复任务和冲突风险。

它不负责：

- 直接生成正文。
- 直接发布内容。
- 直接修改账号配置。
- 直接越过审核创建外部系统任务。
- 自行访问未注册的账号系统。

一句话：

```text
任务分发 Agent 决定“谁来做、做什么、为什么做”，不决定“正文怎么写”和“是否发布”。
```

## 4. 总体流程

```text
Opportunity / Event
→ Assignment Agent Run
→ 读取事件上下文和证据
→ 获取账号列表
→ 获取账号人设、规则、历史表现
→ 查询相似任务
→ 生成分发方案
→ 校验方案
→ 创建账号任务或等待人工确认
```

推荐先做建议确认机制：

```text
Agent 生成分发建议
→ 前端展示给运营人员确认
→ 确认后创建任务
```

等分发质量稳定后，再允许高置信度场景自动创建任务。

## 5. 核心对象

### 5.1 OperatingAccount

运营账号需要统一抽象，不管账号来自本地还是外部系统，都转换成同一结构。

```ts
interface OperatingAccount {
  id: string
  source: 'local' | 'external'
  sourceSystem?: string

  displayName: string
  platform: 'x' | 'youtube' | 'tiktok' | 'linkedin' | string
  handle?: string

  persona: string
  contentRules: string
  generationPrompt?: string

  preferredTopics: string[]
  forbiddenTopics: string[]
  supportedContentTypes: string[]

  audienceProfile?: string
  productFitNotes?: string

  workloadStatus: 'available' | 'busy' | 'paused'
  dailyTaskLimit?: number
  recentTaskCount?: number

  metadata?: Record<string, unknown>
}
```

关键点：

- `source` 说明账号来自哪里。
- `persona` 描述账号是谁。
- `contentRules` 描述账号内容规则。
- `generationPrompt` 描述后续内容生成时的提示词要求。
- `workloadStatus` 用于避免给暂停或忙碌账号继续分配。

### 5.2 AssignmentGoal

每次分发都应该有明确目标。

```ts
interface AssignmentGoal {
  id: string
  targetType: 'opportunity' | 'event' | 'insight' | 'future_event'
  targetId: string
  instruction: string
  constraints: AssignmentConstraints
}
```

示例：

```json
{
  "targetType": "event",
  "targetId": "event_123",
  "instruction": "判断这个事件适合由哪些运营账号承接，并为每个账号给出不同内容角度。"
}
```

### 5.3 AssignmentConstraints

```ts
interface AssignmentConstraints {
  maxAssignmentsPerTarget: number
  allowMultipleAccounts: boolean
  requireDifferentAngles: boolean
  avoidDuplicateRecentTasks: boolean
  requireHumanApproval: boolean
  allowedPlatforms?: string[]
  excludedAccountIds?: string[]
}
```

MVP 建议：

```text
allowMultipleAccounts = true
requireDifferentAngles = true
avoidDuplicateRecentTasks = true
requireHumanApproval = true
```

### 5.4 AssignmentDecision

最终输出必须是结构化结果。

```ts
interface AssignmentDecision {
  targetType: 'opportunity' | 'event' | 'insight' | 'future_event'
  targetId: string

  decision:
    | 'assign'
    | 'skip'
    | 'request_human_review'

  assignments: AssignmentItem[]
  skippedAccounts: SkippedAccount[]

  summary: string
  riskNotes: string[]
  missingData: string[]
  confidence: 'high' | 'medium' | 'low'
}
```

### 5.5 AssignmentItem

```ts
interface AssignmentItem {
  accountId: string
  accountName: string
  accountSource: 'local' | 'external'
  sourceSystem?: string

  priority: 'high' | 'medium' | 'low'
  contentType: string
  contentGoal: string
  angle: string
  constraints: string[]
  reason: string

  evidenceRefs: string[]
  duplicateRisk: 'none' | 'low' | 'medium' | 'high'
}
```

### 5.6 SkippedAccount

```ts
interface SkippedAccount {
  accountId: string
  accountName: string
  reason: string
}
```

## 6. 账号来源抽象

账号来源应该通过 Provider 抽象。

```ts
interface AccountProvider {
  id: string
  name: string
  source: 'local' | 'external'

  listAccounts(query: AccountQuery): Promise<OperatingAccount[]>
  getAccount(accountId: string): Promise<OperatingAccount | null>
  getAccountPerformance?(accountId: string): Promise<AccountPerformance | null>
  getAccountAvailability?(accountId: string): Promise<AccountAvailability | null>
}
```

本地账号 Provider：

```text
LocalAccountProvider
→ 读取本地数据库账号表
```

外部账号 Provider：

```text
ExternalAccountProvider
→ 调用外部账号系统接口
→ 转换成 OperatingAccount
```

任务分发 Agent 不关心账号来自哪里，只关心工具返回的标准账号对象。

## 7. Agent 可用工具

任务分发 Agent 不直接访问数据库，而是通过工具拿数据。

### 7.1 目标上下文工具

```text
target.getContext
target.getEvidence
target.getRelatedSignals
```

用途：

- 获取事件或机会的核心事实。
- 获取证据。
- 获取相关热搜、帖子、视频或话题。

### 7.2 账号工具

```text
accounts.listAvailable
accounts.getProfile
accounts.getPersonas
accounts.getPerformance
accounts.getRecentTasks
accounts.getSourceSystem
```

用途：

- 查可用账号。
- 查账号人设。
- 查账号内容规则。
- 查近期任务。
- 查历史表现。
- 判断是否适合分配。

### 7.3 任务工具

```text
tasks.findSimilar
tasks.getRecentByAccount
tasks.checkDuplicate
```

用途：

- 避免重复任务。
- 避免同一账号反复做相似内容。
- 判断目标事件是否已经分发过。

### 7.4 产品工具

```text
product.getActiveProfile
product.getPositioning
product.getForbiddenClaims
```

用途：

- 判断事件是否能自然承接产品。
- 避免不适合产品表达的角度。
- 避免违规或夸大承诺。

## 8. Agent Loop 执行过程

任务分发 Agent 可以使用和机会挖掘 Agent 类似的受控循环。

```text
创建 AssignmentRun
→ 读取目标上下文
→ 获取可用账号
→ 查询账号详情和历史任务
→ 查询相似任务
→ 生成分发决策
→ 校验决策
→ 输出结果
```

伪代码：

```ts
while (!run.finished) {
  const output = await assignmentAgent.next({
    goal,
    tools,
    targetContext,
    accounts,
    evidence,
    budget,
  })

  if (output.type === 'tool_call') {
    validateToolCall(output)
    const result = await executeTool(output)
    updateRunState(result)
    continue
  }

  if (output.type === 'final_decision') {
    validateAssignmentDecision(output)
    finishRun(output)
    break
  }
}
```

## 9. 分发判断原则

Agent 需要综合以下因素：

### 9.1 事件与账号匹配

- 账号人设是否适合该事件。
- 账号受众是否关心该事件。
- 账号是否支持该内容类型。
- 账号是否有禁忌主题。
- 账号是否适合产品承接。

### 9.2 角度差异

同一事件分配给多个账号时，角度必须不同。

示例：

```text
快讯账号：发生了什么，为什么现在重要。
深度账号：背后结构性变化是什么。
产品承接账号：这个事件说明运营监测为什么重要。
行业评论账号：对行业趋势的影响是什么。
```

不能出现多个账号都写同一套观点。

### 9.3 重复风险

需要检查：

- 同一事件是否已经分配过。
- 同一账号近期是否做过相似内容。
- 不同账号是否会输出高度相似内容。
- 是否与已经发布的内容冲突。

### 9.4 工作负载

需要考虑：

- 账号是否暂停。
- 账号当天任务是否过多。
- 是否超过发布频率。
- 是否存在人工运营容量限制。

### 9.5 证据充分性

如果事件证据不足，不应该强行分发。

可以输出：

```text
request_human_review
```

或者：

```text
skip
```

并说明原因。

## 10. 输出示例

```json
{
  "targetType": "event",
  "targetId": "event_123",
  "decision": "assign",
  "summary": "该事件适合分配给 3 个账号，分别承担快讯、行业分析和产品承接角度。",
  "assignments": [
    {
      "accountId": "acct_flash_news",
      "accountName": "快讯型账号",
      "accountSource": "local",
      "priority": "high",
      "contentType": "short_post",
      "contentGoal": "快速说明事件核心事实和短期影响。",
      "angle": "用 3-5 句话解释事件发生了什么，以及为什么正在被讨论。",
      "constraints": [
        "不要展开长篇背景",
        "必须引用事件事实依据",
        "避免夸大未确认影响"
      ],
      "reason": "该账号适合快速响应高时效事件。",
      "evidenceRefs": ["ev_001", "ev_002"],
      "duplicateRisk": "low"
    },
    {
      "accountId": "acct_deep_analysis",
      "accountName": "深度分析账号",
      "accountSource": "local",
      "priority": "medium",
      "contentType": "analysis_thread",
      "contentGoal": "解释该事件背后的行业变化和可能影响。",
      "angle": "从行业结构和长期趋势角度分析该事件。",
      "constraints": [
        "需要区分事实和推测",
        "必须说明不确定性"
      ],
      "reason": "该账号适合承接复杂事件的解释型内容。",
      "evidenceRefs": ["ev_001", "ev_003"],
      "duplicateRisk": "none"
    }
  ],
  "skippedAccounts": [
    {
      "accountId": "acct_meme",
      "accountName": "梗图账号",
      "reason": "该事件缺少可视化梗点，不适合强行梗图化。"
    }
  ],
  "riskNotes": [
    "部分事实仍需后续追踪确认。",
    "多个账号承接时需要避免重复表达。"
  ],
  "missingData": [],
  "confidence": "medium"
}
```

## 11. 和内容生成 Agent 的关系

任务分发 Agent 的输出会成为内容生成 Agent 的输入。

```text
AssignmentItem
→ Content Generation Agent
```

内容生成 Agent 不需要重新判断为什么这个账号适合该事件，它只需要基于分发结果生成内容。

输入示例：

```ts
interface ContentGenerationInput {
  targetId: string
  accountId: string
  accountPersona: string
  contentRules: string
  contentGoal: string
  angle: string
  constraints: string[]
  evidenceRefs: string[]
}
```

这样可以把职责拆清：

```text
机会挖掘 Agent：判断有没有机会。
任务分发 Agent：判断谁来做、做什么角度。
内容生成 Agent：根据账号和角度生成内容。
```

## 12. 和外部账号系统的关系

如果未来接外部账号系统，不应该让业务逻辑直接依赖外部接口。

推荐方式：

```text
External Account System
→ AccountProvider
→ OperatingAccount
→ Assignment Agent Tool
```

外部系统只负责提供账号事实：

- 账号列表。
- 账号状态。
- 账号人设。
- 账号规则。
- 账号可用性。
- 账号历史表现。

分发判断仍由本系统的 Agent 完成。

这样做的好处：

- 外部系统可以替换。
- 本地账号和外部账号可以混用。
- 分发逻辑不依赖具体账号系统。
- 账号能力变化后不需要改 Agent 主流程。

## 13. 数据记录建议

建议记录 Assignment Run，而不是只记录最终任务。

### 13.1 assignment_runs

记录一次分发运行。

```text
id
target_type
target_id
status
goal
decision
confidence
risk_notes
missing_data
started_at
finished_at
created_at
```

### 13.2 assignment_run_steps

记录 Agent 每一步工具调用和判断。

```text
id
run_id
step_index
step_type
tool_name
input
output
reason
created_at
```

### 13.3 assignment_decisions

记录结构化分发结果。

```text
id
run_id
target_type
target_id
decision
summary
confidence
created_at
```

### 13.4 assignment_items

记录每个账号的分发项。

```text
id
decision_id
account_id
account_source
source_system
priority
content_type
content_goal
angle
constraints
reason
duplicate_risk
status
created_task_id
created_at
```

这些记录的作用是：

- 方便审计为什么分配给某个账号。
- 方便复盘分发质量。
- 方便追踪哪些分发建议最终变成任务。
- 方便优化后续分发策略。

## 14. MVP 方案

MVP 不做完整外部系统接入，先把账号抽象、分发决策和人工确认边界打稳。

### 14.1 输入

支持：

- 一个 Event。
- 一个 Opportunity。

### 14.2 账号来源

先支持：

```text
LocalAccountProvider
```

但接口设计必须支持未来增加：

```text
ExternalAccountProvider
```

### 14.3 可用工具

MVP 只开放读工具：

```text
target.getContext
target.getEvidence
accounts.listAvailable
accounts.getRecentTasks
tasks.findSimilar
product.getActiveProfile
```

### 14.4 输出

只输出分发建议，不直接发布。

可以允许人工确认后创建任务。

### 14.5 限制

```text
maxToolCalls = 6
maxRunMs = 90000
默认需要人工确认
不允许直接发布
不允许修改账号配置
```

## 15. 后续演进

### 阶段一：分发建议

Agent 只生成分发建议，人工确认。

### 阶段二：半自动创建任务

人工确认后，系统自动创建账号任务。

### 阶段三：高置信度自动分发

对低风险、高置信度、无重复冲突的事件，可以自动创建任务。

### 阶段四：跨系统账号接入

接入外部账号系统，通过 AccountProvider 统一输出账号对象。

### 阶段五：分发效果反馈

根据发布后的效果追踪，反向优化分发策略：

- 哪类事件适合哪个账号。
- 哪类角度转化更好。
- 哪些账号不适合某些主题。
- 哪些分发规则需要调整。

## 16. 安全边界

必须限制：

- 账号来源白名单。
- 可调用工具白名单。
- 工具调用次数。
- 工具超时时间。
- 查询时间范围。
- 可分配账号范围。
- 单事件最大分发账号数。
- 单账号每日最大任务数。
- 输出 schema。

必须禁止：

- Agent 直接发布内容。
- Agent 直接修改账号配置。
- Agent 直接调用未注册外部系统。
- Agent 给暂停账号分配任务。
- Agent 在无证据情况下强行分发。
- Agent 创建重复任务。
- Agent 为多个账号生成完全相同角度。

## 17. 成功标准

MVP 成功后，应满足：

- 账号可以来自统一 Provider。
- Agent 能理解账号人设和内容规则。
- Agent 能判断哪些账号适合目标事件。
- Agent 能为不同账号生成不同承接角度。
- Agent 能说明选择和跳过账号的理由。
- Agent 能检查近期相似任务。
- Agent 输出结构化分发建议。
- 分发建议可以被人工确认后转成任务。
- 后续接入外部账号系统时，不需要重写分发逻辑。

## 18. 核心结论

任务分发不是固定映射，而是一个需要上下文判断的运营决策。

系统应该从：

```text
Event Type → Account Type → Task
```

升级为：

```text
Event / Opportunity
→ Assignment Agent
→ Account Provider
→ Assignment Decision
→ Account Tasks
```

最终系统会形成三段清晰链路：

```text
数据采集插件
→ 机会挖掘 Agent
→ 任务分发 Agent
→ 内容生成 Agent
```

这样每一层都可以单独使用、单独替换、单独演进，也更符合真实运营流程。
