# 数据采集插件化架构设计

## 1. 核心目标

新数据采集系统的第一原则是：

```text
新增平台时，只写“这个平台怎么采集”的代码，不重写后面的入库、去重、机会挖掘、分析、内容生成和展示链路。
```

也就是说，平台差异只存在于采集插件内部。插件负责和外部平台打交道，系统负责把采集结果变成统一数据，再交给后续机会挖掘系统消费。

目标链路：

```text
平台采集插件
→ 原始数据 RawItem
→ 标准信号 Signal
→ 统一入库、去重、追踪
→ 机会挖掘 Opportunity Mining
→ 分析洞察与内容角度
```

## 2. 设计挑战

新系统需要避免把每个平台都做成一套独立小系统：

- 不同平台的鉴权、分页、限流、字段和错误格式都不同。
- 不同采集对象会有不同调度频率和采集范围。
- 采集结果既要保留平台原始数据，也要转成统一信号。
- 后续机会挖掘不应该理解每个平台的内部细节。
- 新增平台时不应该重写调度、入库、运行记录和错误展示。
- 平台 API Key、抓取策略和采集对象需要统一治理。

如果缺少统一抽象，系统会越接平台越重，每个平台都像一个小系统。

## 3. 设计边界

### 3.1 插件负责什么

每个平台插件只负责平台相关能力：

- 鉴权方式。
- API 请求或网页抓取。
- 分页。
- 限流。
- 重试。
- 平台错误转换。
- 原始结果解析。
- 把平台数据转换为统一 `RawItem` 或 `Signal`。

### 3.2 插件不负责什么

插件不负责业务判断：

- 不判断是否形成热点。
- 不判断是否值得运营响应。
- 不生成内容机会。
- 不分配账号任务。
- 不生成内容草稿。
- 不直接修改业务核心表。

这些属于后续统一系统。

## 4. 总体架构

```text
DataSourcePluginRegistry
  注册所有平台插件

CollectionJob
  配置采集任务：用哪个插件、哪个能力、多久跑一次、采集什么对象

CollectionRunner
  统一执行采集任务，处理状态、重试、错误和入库

RawItemStore
  保存原始采集结果，保留平台原始数据和追溯信息

SignalNormalizer
  将 RawItem 转换为统一 Signal

SignalStore
  保存标准信号，供机会挖掘系统消费
```

## 5. 插件模型

### 5.1 DataSourcePlugin

一个平台对应一个插件。

```ts
interface DataSourcePlugin {
  id: string
  platform: string
  name: string
  description: string
  version: string

  authSchema: JsonSchema
  configSchema: JsonSchema
  capabilities: DataSourceCapability[]

  createClient(input: {
    auth: unknown
    config: unknown
  }): Promise<DataSourceClient>
}
```

示例：

```text
x-plugin
youtube-plugin
rss-plugin
web-search-plugin
prediction-market-plugin
reddit-plugin
```

### 5.2 DataSourceCapability

一个插件可以提供多个采集能力。

```ts
interface DataSourceCapability {
  id: string
  name: string
  description: string

  sourceType:
    | 'trend'
    | 'post'
    | 'video'
    | 'comment'
    | 'account'
    | 'article'
    | 'market'
    | 'meme'
    | 'metric'

  inputSchema: JsonSchema
  outputSchema: JsonSchema

  limits: {
    maxPageSize?: number
    maxLookbackHours?: number
    defaultTimeoutMs: number
    defaultIntervalMs?: number
  }

  collect(input: {
    client: DataSourceClient
    params: unknown
    cursor?: string | null
    context: CollectionContext
  }): Promise<CollectionCapabilityResult>
}
```

### 5.3 CollectionCapabilityResult

```ts
interface CollectionCapabilityResult {
  items: RawItem[]
  nextCursor?: string | null
  hasMore: boolean
  rateLimit?: {
    remaining?: number
    resetAt?: string
  }
  diagnostics?: {
    level: 'info' | 'warning' | 'error'
    message: string
  }[]
}
```

## 6. 标准数据模型

### 6.1 RawItem

`RawItem` 是平台采集回来的原始数据包装。它保留平台差异，用于追溯和调试。

```ts
interface RawItem {
  id: string
  platform: string
  pluginId: string
  capabilityId: string
  sourceType: string
  sourceItemId: string

  title?: string
  text?: string
  url?: string
  authorId?: string
  authorHandle?: string
  authorName?: string
  region?: string
  language?: string

  publishedAt?: string
  observedAt: string

  metrics?: Record<string, number | null>
  raw: unknown

  trace: {
    collectionRunId: string
    collectionJobId: string
    fetchedAt: string
    requestKey?: string
  }
}
```

### 6.2 Signal

`Signal` 是业务层消费的标准信号。后续机会挖掘尽量只依赖 `Signal`，不依赖平台原始结构。

```ts
interface Signal {
  id: string
  platform: string
  sourceType: string
  sourceItemId: string

  title: string
  summary?: string
  text?: string
  url?: string
  authorHandle?: string
  authorName?: string
  region?: string
  language?: string

  publishedAt?: string
  observedAt: string

  metrics?: {
    rank?: number
    views?: number
    likes?: number
    replies?: number
    reposts?: number
    comments?: number
    score?: number
    volume?: number
    changePct?: number
    engagementRate?: number
  }

  labels: string[]
  rawItemId: string
}
```

### 6.3 为什么 RawItem 和 Signal 要分开

`RawItem` 解决追溯问题：

- 平台返回了什么。
- 当时请求参数是什么。
- 出错时怎么复查。
- 后续平台字段变动时如何重新解析。

`Signal` 解决业务统一问题：

- 机会挖掘不用关心平台原始结构。
- X 帖子、YouTube 视频、RSS 文章都可以进入统一分析。
- 后续前端看板也可以复用统一字段。

## 7. 采集任务配置

采集任务不直接写死在代码里，而是配置化。

```ts
interface CollectionJobConfig {
  id: string
  name: string
  enabled: boolean

  pluginId: string
  capabilityId: string

  schedule: {
    type: 'cron' | 'interval' | 'manual'
    value?: string
    timezone?: string
  }

  params: unknown

  output: {
    rawItemStore: boolean
    signalStore: boolean
    labels?: string[]
  }

  policy: {
    maxItemsPerRun?: number
    timeoutMs?: number
    retryCount?: number
    dedupeKeyFields: string[]
  }
}
```

示例：X 热搜采集任务。

```json
{
  "id": "x-trending-us",
  "name": "X 美国热搜榜",
  "enabled": true,
  "pluginId": "x-plugin",
  "capabilityId": "x.getTrending",
  "schedule": {
    "type": "cron",
    "value": "*/15 * * * *",
    "timezone": "Asia/Shanghai"
  },
  "params": {
    "regions": ["United States"],
    "limit": 30
  },
  "output": {
    "rawItemStore": true,
    "signalStore": true,
    "labels": ["hotlist", "realtime"]
  },
  "policy": {
    "maxItemsPerRun": 30,
    "timeoutMs": 60000,
    "retryCount": 2,
    "dedupeKeyFields": ["platform", "sourceType", "sourceItemId", "observedAt"]
  }
}
```

## 8. 调度与执行

### 8.1 CollectionRunner 流程

```text
读取启用的 CollectionJobConfig
→ 从 PluginRegistry 找到插件和 capability
→ 校验 params
→ 创建 CollectionRun
→ 调用 capability.collect
→ 保存 RawItem
→ 标准化 Signal
→ 保存 Signal
→ 更新 cursor / sync state
→ 记录成功或失败
```

### 8.2 CollectionRun 状态

```text
pending
running
success
partial_success
failed
cancelled
```

### 8.3 错误处理

错误必须标准化：

```ts
interface CollectionError {
  code:
    | 'auth_failed'
    | 'rate_limited'
    | 'timeout'
    | 'invalid_config'
    | 'platform_error'
    | 'parse_error'
    | 'unknown'
  message: string
  retryable: boolean
  raw?: unknown
}
```

前端和后续系统不应该直接依赖平台原始错误。

## 9. 去重策略

去重分两层。

### 9.1 RawItem 去重

RawItem 以平台原始对象为核心：

```text
platform + sourceType + sourceItemId + collectionJobId
```

如果同一个对象多次采集，可以更新 `observedAt` 和最新指标，也可以保存 observation 历史。

### 9.2 Signal 去重

Signal 是业务层信号，去重更关注语义和时间窗口：

```text
platform + sourceType + sourceItemId
```

后续 Opportunity Mining 再处理跨平台、跨来源的语义合并。

## 10. 插件目录建议

内部插件可以先放在后端项目里，不急着做独立 npm 包。

```text
src/data-collection/
  plugin-registry.ts
  collection-runner.ts
  collection.types.ts
  raw-item.repository.ts
  signal.repository.ts

src/data-plugins/
  x/
    x.plugin.ts
    x.client.ts
    capabilities/
      get-trending.ts
      search-posts.ts
      get-account-posts.ts

  youtube/
    youtube.plugin.ts
    youtube.client.ts
    capabilities/
      search-videos.ts
      get-trending-videos.ts
      get-video-transcript.ts

  rss/
    rss.plugin.ts
    capabilities/
      fetch-feed.ts

  web/
    web-search.plugin.ts
```

后续如果要开放插件生态，再把插件包拆出去。

## 11. 和 OpenClaw 的关系

这里不建议把主服务建立在 OpenClaw 之上。

更合理的方式是：

```text
借鉴 OpenClaw 的插件思想
实现内部 DataSourcePlugin 机制
必要时把 OpenClaw 当成外部工具网关或插件来源
```

原因：

- 数据采集层最重要的是统一业务数据模型，而不是先接一个完整 Agent 生态。
- 数据采集需要稳定调度、入库、审计、去重，这些必须在本系统里可控。
- OpenClaw 更适合作为工具能力来源，不应该替代本系统的业务数据库。

## 12. 和 LangGraph 的关系

LangGraph 更适合“机会挖掘”和“动态分析”层，不适合作为采集插件层的核心。

采集插件层应该尽量确定：

```text
给定配置
→ 调用平台
→ 返回 RawItem / Signal
```

机会挖掘层才需要：

```text
看到一个 Signal
→ 判断证据是否足够
→ 动态调用更多工具
→ 形成 Opportunity
```

所以建议：

```text
数据采集插件化：自建轻量插件系统
机会挖掘动态化：使用 LangGraph 承载 Agent 工作流
OpenClaw：作为外部工具/插件生态参考
```

## 13. 内置插件示例

### 13.1 X 热搜

```text
x-plugin.capability.getTrending
→ RawItem
→ Signal(sourceType='trend')
```

### 13.2 重点主题追踪

```text
x-plugin.capability.getAccountPosts
→ RawItem
→ Signal(sourceType='post', labels=['topic_circle'])
→ Opportunity Mining 聚类和分析
```

### 13.3 YouTube 爆款视频

```text
youtube-plugin.capability.getTrendingVideos
youtube-plugin.capability.searchVideos
youtube-plugin.capability.getVideoTranscript
→ RawItem / Signal
→ Opportunity Mining 或 Video Insight Analysis
```

### 13.4 未来事件

未来事件不一定是平台采集插件，也可以作为内部数据插件：

```text
calendar-plugin.capability.getFutureEvents
economic-calendar-plugin.capability.getEvents
```

输出同样变成 Signal。

## 14. 前端配置形态

后续前端不应该为每个平台做完全独立配置页，而是统一成：

```text
数据源插件
→ 能力列表
→ 采集任务
→ 运行记录
→ 原始数据
→ 标准信号
```

页面结构建议：

```text
数据采集
  插件管理
  采集任务
  运行记录
  原始数据
  标准信号
```

运营人员新增采集任务时选择：

```text
插件：X
能力：获取账号帖子
对象：@OpenAI、@AnthropicAI
频率：每 3 小时
标签：AI 与科技、竞品观察
输出：保存为 Signal
```

## 15. MVP 范围

MVP 不做完整插件市场，只做内部插件运行时。

建议最小范围：

1. 定义 `DataSourcePlugin` 和 `DataSourceCapability` 接口。
2. 实现 `PluginRegistry`。
3. 实现统一 `CollectionJobConfig`。
4. 实现统一 `CollectionRun`。
5. 实现 `RawItem` 和 `Signal` 表。
6. 实现 X 热搜作为第一个插件能力。
7. 实现 YouTube 视频搜索作为第二个插件能力。
8. 前端提供采集任务列表和运行状态。

暂时不做：

- 外部插件动态安装。
- 插件市场。
- 复杂权限系统。
- LangGraph 动态挖掘。
- OpenClaw 深度集成。

## 16. 成功标准

MVP 完成后，应满足：

- 新增一个平台时，只需要新增一个插件目录。
- 新增一个采集能力时，只需要实现一个 capability。
- 采集任务配置、调度、运行记录、错误展示不需要为每个平台重写。
- 后续机会挖掘只消费统一 `Signal`。
- 原始数据仍可追溯到平台返回的 raw。
- 插件失败不会影响其他插件任务。
- 平台 API Key 不进入前端。
- 每次采集都有运行记录和错误原因。

## 17. 核心结论

数据采集层应该先做成内部插件化架构。

```text
平台差异留在插件里
采集调度统一
原始数据统一
标准信号统一
后续机会挖掘统一
```

这样系统后面接 X、YouTube、Reddit、RSS、预测市场、搜索、小众平台时，都不会继续复制一套完整业务流程。
