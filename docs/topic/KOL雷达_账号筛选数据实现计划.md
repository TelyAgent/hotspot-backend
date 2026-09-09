# KOL 雷达 · 账号筛选数据实现计划

> 状态：M0 / M1 / M2 / M3 / M4 / M5 已完成（缺凭据时仅跳过 M3 的实网运行）；前端设置页已补账号关键指标展示
> 关联：`hotspot-master/src/pages/Monitor/CustomMonitoringGroups.tsx`、`KolRadar.tsx`、`Settings/items/KolRadarSetting.tsx`
> 关联文档：`docs/topic/kol人驱动热点雷达_每6小时.md`

## 1. 背景与目标

`CustomMonitoringGroups.tsx` 的「新建群组」功能需要按账号维度做条件筛选，并对「匹配账号」做预览。当前实现里账号数据来自前端硬编码的 `ACCOUNT_POOL`（12 个 mock 账号），互动指标（`weeklyPosts` / `avgComments` / `avgReposts` / `avgViews` / `avgLikes`）是写死的常量，不是真实数据。

本计划目标：

1. 用真实数据替换 mock 账号池。
2. 「近 7 天单帖平均互动」等互动指标 **不额外调用 twitterapi.io**，改为**从系统已采集的帖子（`signals` 表）本地聚合**。
3. 粉丝量、区域等帖子数据里没有的静态资料，通过 `account_profiles` 缓存表 + 批量刷新补齐。
4. 前端筛选读取改为只读本地缓存，不实时查外部。

## 2. 需求数据清单（来自 CustomMonitoringGroups.tsx）

前端 `MonitoringAccount` 类型需要的字段，及其数据来源映射：

| 前端字段 | 含义 | 数据来源 | 说明 |
|---|---|---|---|
| `handle` | 账号 handle | signals.metadata.authorHandle / account_profiles | 标准化：去 `@`、小写 |
| `name` | 显示名 | account_profiles.displayName | 帖子 metadata.authorName 可作兜底 |
| `followers` | 粉丝量 | account_profiles.followers | **帖子数据里没有**，需缓存 + 批量刷新 |
| `region` | 区域 | account_profiles.region | **帖子数据里没有**；人工标签优先，自动识别兜底 |
| `accountType` | 账号类型（official/kol/media/project/institution） | account_profiles.accountType | 人工标签优先；现有 `inferAccountType` 规则可作兜底 |
| `weeklyPosts` | 近 7 天发文数 | **signals 聚合** | count(distinct post)，窗口按 publishedAt |
| `avgComments` | 近 7 天单帖平均评论 | **signals.metrics.replies 聚合** | AVG |
| `avgReposts` | 近 7 天单帖平均转发 | **signals.metrics.reposts 聚合** | AVG |
| `avgViews` | 近 7 天单帖平均浏览 | **signals.metrics.views 聚合** | AVG |
| `avgLikes` | 近 7 天单帖平均点赞 | **signals.metrics.likes 聚合** | AVG |
| `lastActiveAt` | 最近活跃时间 | signals 聚合 | max(publishedAt) |

筛选条件 `CustomGroupFilters`（`followerMin/Max`、`minWeeklyPosts`、`minAvgComments/Reposts/Views/Likes`、`regions`、`manualIncludes/Excludes`）全部落在上表字段上，无需新增字段。

### 关键口径约定

- **「近 7 天」按帖子发布时间 `publishedAt` 计算**，而不是采集时间 `observedAt`。`publishedAt` 在 `signals.metadata.publishedAt`（ISO 字符串），`observedAt` 是采集时刻，同一批帖子可能被多轮采集，不能作时间口径。
- **互动指标键名**（来自 `x-account-posts` 插件的 `mapTimelineTweet`）：`views` / `likes` / `reposts` / `replies` / `quotes` / `bookmarks`。注意是 `reposts`（转发）和 `replies`（评论），不是 `retweets` / `comments`。
- 聚合时忽略 `postType = 'repost'` 的转发帖？——**默认不忽略**，先按全部帖子算；后续若发现转发拉高均值再按 `postType` 细分（见「开放问题」）。

## 3. 核心决策：数据来源分工

| 数据类别 | 来源 | 刷新方式 | 频率 |
|---|---|---|---|
| 静态资料（followers / region / bio / displayName / accountType） | `account_profiles` 表 | twitterapi.io `batch_info_by_ids` 批量刷新 | 活跃账号每 24h |
| 互动指标（weeklyPosts / avg* / lastActiveAt） | `signals` 表本地聚合 → 物化到 `account_profiles` | 本地 SQL 聚合，不调外部 API | 随采集后触发 / 每 24h |

原则：**外部 API 只用于补齐帖子数据里没有的静态资料；能本地算的一律本地算。**

## 3.5 账号名单统一到 `account_profiles`（替代 `project_configs.kolAccounts`）

### 现状问题

KOL 雷达的账号名单当前存在 `project_configs` 表的单个 JSON 值里：key = `x.trends.kolAccounts`，value = `[{ handle, groupTag, joinedAt, enabled }]`。前端 `KolRadarSetting.tsx` 的 `persist()` 每次把**整个数组**回传给 `PATCH /project-config/x-trends`。

这个设计有几个结构性问题：

| 问题 | 说明 |
|---|---|
| 整数组覆盖写 | 改一个账号也重写全量；并发编辑互相覆盖，无行级锁/乐观锁 |
| 无唯一约束 | handle 去重靠应用层 `normalizeKolAccounts()` 里的 `seen` Set，数据库层拦不住 |
| 不可查询 / 不可关联 | 调度器每次全量读再 `.filter(enabled).map(handle)`；账号规模上来后做不了筛选分页，也无法与 `signals` / `account_profiles` JOIN |
| 双份真相 | 名单在 `project_configs`、资料在 `account_profiles`，删除/新增要同时动两处，必然产生不一致 |
| 无单账号审计 | `updatedBy` 记在 config 级别，整数组保存时会互相覆盖 |

### 决策

**账号是实体，不是配置项。** 把账号名单并入 `account_profiles`，`project_configs` 只保留标量配置。

- **保留在 `project_configs`**：`x.trends.kolRadarEnabled`、`x.trends.kolRadarCollectionIntervalMs`、`x.trends.kolRadarMinViews`（单值开关/阈值，适合 KV 配置）
- **迁到 `account_profiles`**：`handle` / `groupTag` / `joinedAt` / `enabled` → 对应 `monitorEnabled`

### 字段语义（两个开关不要混）

- `monitorEnabled`（原 `enabled`）：**用户意图** —— 这个号是否进 KOL 雷达采集。仅 `source = 'manual' | 'seed'` 的账号为 true。
- `isActive`：**系统维护** —— 这个号是否进自动资料刷新。`monitorEnabled = true` 的恒为 true；`discovered` 账号近 30 天有帖子则为 true。

`source` 取值：

| 值 | 含义 | 参与采集 | 出现在群组筛选账号池 |
|---|---|---|---|
| `seed` | 迁移自历史配置 / 种子数据 | 是（若 monitorEnabled） | 是 |
| `manual` | 用户在设置页新增 | 是 | 是 |
| `discovered` | 从 signals 已采集帖子自动发现 | 否 | 是 |

这样「采集名单」和「筛选账号池」解耦：`discovered` 账号不进 KOL 雷达采集，但能被 `CustomMonitoringGroups.tsx` 筛到。

### 迁移步骤

1. `AccountProfileService.onModuleInit()` 一次性种子：读 `project_configs['x.trends.kolAccounts']` → upsert 到 `account_profiles`（`monitorEnabled = enabled`、`groupTag`、`joinedAt`、`source = 'seed'`）。
2. 兼容期：`account_profiles` 为空时才从 config 回灌；跑通一个版本后移除 fallback。
3. `data-source-scheduler.service.ts` 两处（`runDueKolRadarCollection` / `triggerKolRadarCollection`）的 handles 来源改为 `accountProfileService.listMonitoredHandles()`，仍受 `kolRadarEnabled` 开关控制。
4. 清理 `project-config`：删除 `kolRadarAccounts` 字段、`KolRadarAccountConfig` 类型、`normalizeKolAccounts()` / `mergeKolAccounts()` / `backfillKolAccounts()` 及 `'x.trends.kolAccounts'` 的 seed/description。
5. 前端 `KolRadarSetting.tsx`：从「整数组 PATCH」改为行级 REST —— `POST /account-profiles`、`PATCH /account-profiles/:handle`、`DELETE /account-profiles/:handle`；`api/collectionConfig.ts` 中的 `kolAccounts` / `monitoredAccounts` 标记 deprecated 后移除。

### 删除语义（已确认：硬删 + 墓碑表）

设置页「删除」= **真正 DELETE `account_profiles` 行**（保留现有硬删语义，不做软删）。

但硬删与 4.2 的「自动发现」冲突：只要 `signals` 里还有该 handle 的帖子，下一轮聚合就会把它以 `source='discovered'` 重新插回账号池，删了等于没删。因此配套引入**墓碑表**：

```prisma
model AccountProfileTombstone {
  handle    String   @id            // 标准化 handle
  deletedAt DateTime @default(now())

  @@map("account_profile_tombstones")
}
```

规则：

- `DELETE /account-profiles/:handle` → 删除 `account_profiles` 行的**同时**写入一条 tombstone（同一事务）。
- `AccountProfileAggregationService` 自动发现新 handle 时，先 `NOT IN (SELECT handle FROM account_profile_tombstones)` 过滤；已存在的行不受影响。
- 墓碑表只防「自动发现」，不影响用户再次手动添加——`POST /account-profiles` 显式新增时**主动删除**对应墓碑。
- 墓碑表不设过期，长期保留；如需彻底复活，走「手动添加」或运维清理。

## 4. 后端实现计划

### 4.1 新增 Prisma 模型 `AccountProfile`

在 `prisma/schema.prisma` 新增（`@@map("account_profiles")`）：

```prisma
model AccountProfile {
  handle          String   @id            // 标准化 handle（去 @、小写）
  displayHandle   String?                 // 原始大小写，仅用于展示
  displayName     String?
  twitterUserId   String?  @unique        // batch_info_by_ids 按 userId 查询，需落库
  followers       Int?
  region          String?                 // 生效值：人工标签优先，自动识别兜底
  regionSource    String?                 // 'manual' | 'auto' | null
  bio             String?
  accountType     String?                 // 'official' | 'kol' | 'media' | 'project' | 'institution'
  accountTypeSource String?               // 'manual' | 'auto'

  // 监控名单配置（原 project_configs['x.trends.kolAccounts']，见 3.5）
  monitorEnabled  Boolean  @default(false) // 是否进 KOL 雷达采集（原 enabled）
  groupTag        String?
  joinedAt        DateTime @default(now())
  source          String   @default('discovered') // 'manual' | 'seed' | 'discovered'

  // 互动指标物化（从 signals 聚合）
  weeklyPosts     Int      @default(0)
  avgComments     Float?
  avgReposts      Float?
  avgViews        Float?
  avgLikes        Float?
  lastActiveAt    DateTime?

  // 生命周期
  isActive        Boolean  @default(true) // 是否进自动刷新（系统维护，见 3.5）
  lastFetchedAt   DateTime?               // 静态资料最近一次外部刷新
  lastAggregatedAt DateTime?              // 互动指标最近一次本地聚合
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([monitorEnabled])
  @@index([isActive, lastFetchedAt])
  @@map("account_profiles")
}
```

说明：

- 以 `handle` 为主键，与前端的 `normalizeHandle`（去 `@`、小写）对齐；`manualIncludes/Excludes` 目前用 id 标识，改造后统一用 `handle` 作唯一标识。主键天然去重，可移除 `project-config` 中 `normalizeKolAccounts()` 的 `seen` 兜底逻辑。
- `region` / `accountType` 采用「人工标签优先」：`regionSource = 'manual'` 时不覆盖，`auto` 时下次自动刷新可覆盖。
- 互动指标与静态资料分两个时间戳（`lastAggregatedAt` / `lastFetchedAt`），二者刷新频率与失败处理独立。
- `monitorEnabled` 与 `isActive` 语义不同，勿合并：前者是用户意图（是否采集），后者是系统判定（是否养资料）。
- `handle` 存小写（与 signals 聚合口径对齐），另存 `displayHandle` 保留原始大小写用于 UI 展示。
- 设置页只展示「监控名单」账号，用 `GET /account-profiles?monitoring=true`（`source IN ('manual','seed')`）区分于自动发现的 `discovered` 账号。

### 4.2 互动指标聚合（从 signals 本地算）

新增 `AccountProfileAggregationService`（建议放 `src/account-profile/`，或先挂 `src/signal/` 下）。

核心查询（Prisma `$queryRaw`，Postgres JSON 操作符）：

```sql
SELECT
  LOWER(TRIM(BOTH '@' FROM (metadata->>'authorHandle'))) AS handle,
  COUNT(DISTINCT COALESCE(metadata->>'postId', metadata->>'sourceItemId')) AS weeklyPosts,
  AVG(COALESCE((metrics->>'replies')::numeric, 0)) AS avgComments,
  AVG(COALESCE((metrics->>'reposts')::numeric, 0)) AS avgReposts,
  AVG(COALESCE((metrics->>'views')::numeric, 0))  AS avgViews,
  AVG(COALESCE((metrics->>'likes')::numeric, 0))  AS avgLikes,
  MAX(COALESCE((metadata->>'publishedAt')::timestamptz, observed_at)) AS lastActiveAt
FROM signals
WHERE source = 'x'
  AND signal_type = 'x_post'
  AND COALESCE((metadata->>'publishedAt')::timestamptz, observed_at) >= now() - interval '7 days'
GROUP BY 1;
```

要点：

- 时间窗口以 `publishedAt` 优先，`observedAt` 兜底（见 2.1 口径）。
- `metrics` 中可能存在 `null`（`mapTimelineTweet` 用 `?? null`），用 `COALESCE(..., 0)` 兜底。
- 聚合结果 `upsert` 回 `account_profiles`，并更新 `lastAggregatedAt`。
- 只聚合「已存在账号」还是「全部 handle」？——**全部 handle 都聚合**，同时把新出现的 handle 以 `source = 'discovered'`、`isActive = true` 自动补进 `account_profiles`，这样账号池自然随采集增长。

### 4.3 静态资料刷新任务

新增 `AccountProfileRefreshService`，复用 twitterapi.io：

- 接口：`GET /twitter/user/batch_info_by_ids?userIds=...`（批量 100+ 时 10 credits/user，单用户 18 credits/user）。
- **前提**：`batch_info_by_ids` 按 `userId` 查询，需要先有 userId。当前 `x-account-posts` 插件只存了 `authorHandle`，未存 `authorId`（`mapTimelineTweet` 有 `tweet.author.id` 但没落库到 metadata）。因此：
  - 方案 A（推荐）：在 `AccountProfile` 增加 `twitterUserId` 字段，采集落库时把 `authorId` 一起写入；或
  - 方案 B：刷新前先用 `/twitter/user/info?userName=` 逐个解析 userId 再批量查（多一步、多一次调用，不推荐）。
  - **实施优先级**：先加 `twitterUserId` 字段，改造 `x-account-posts` 的 normalize 把 `authorId` 写进 `signal.metadata.authorId`，聚合时一并落库。

刷新策略（对齐已确认的计划）：

1. **新账号**：`account_profiles` 新增行后立即刷新一次。
2. **活跃账号**：`isActive = true` 的统一每 24h 刷新一次。
3. **非活跃账号**：`isActive = false` 不进自动刷新。
4. **失败退避**：单账号刷新失败记 `lastFetchedAt` 不变，并按退避（如 1h → 3h → 6h，封顶 24h）重试；可复用现有采集层思路，或在 `account_profiles` 增加 `refreshAttempts` / `nextRetryAt`（可选）。
5. **批量**：把到期的账号按 100 个一批调用 `batch_info_by_ids`。

region 识别（自动兜底）：`batch_info_by_ids` 返回的是自由文本 `location`，需要本地解析（关键词/规则映射到「美国/英国/日本/韩国/新加坡/未知」等现有 `REGION_OPTIONS`）。`regionSource = 'auto'` 时写入识别结果；`manual` 时不覆盖。

### 4.4 API 设计

新增 `AccountProfileController`（建议路径 `/account-profiles`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/account-profiles` | 返回账号列表（含全部筛选所需字段 + `lastFetchedAt` / `lastAggregatedAt` / `regionSource`），支持 `?active=true` 过滤 |
| POST | `/account-profiles/refresh` | 手动刷新；body 可选 `{ handles?: string[] }`，不传则刷新全部到期账号 |
| POST | `/account-profiles/aggregate` | 手动触发本地互动指标聚合（可并入 refresh） |
| PATCH | `/account-profiles/:handle` | 人工维护 region / accountType / bio 等标签（regionSource=manual） |

返回结构（前端直接消费）：

```ts
interface AccountProfileDto {
  handle: string
  displayName: string | null
  followers: number | null
  region: string | null
  accountType: AccountType | null
  weeklyPosts: number
  avgComments: number | null
  avgReposts: number | null
  avgViews: number | null
  avgLikes: number | null
  lastActiveAt: string | null
  lastFetchedAt: string | null   // 「最后刷新时间」展示用
  lastAggregatedAt: string | null
}
```

## 5. 前端实现计划

改动集中在 `CustomMonitoringGroups.tsx`，`KolRadar.tsx` 基本不动：

1. **删除 `ACCOUNT_POOL` 常量**，新增 `useAccountProfiles()` hook（对齐现有 `useKolRadarFeed` 模式），从 `GET /account-profiles` 拉取账号列表，含 loading / error / reload。
2. **改造 `getMatchedAccounts(group)`**：入参从隐式的 `ACCOUNT_POOL` 改为显式传入账号列表 `AccountProfile[]`；筛选逻辑本身不变（`followerMin/Max`、`minWeeklyPosts`、`minAvg*`、`regions`、`manualIncludes/Excludes`）。
   - `manualIncludes/Excludes` 的 value 从 `account.id` 改为 `account.handle`。
3. **`CustomGroupEditorDrawer` 的「匹配账号预览」**：`matchedAccounts` 改为基于后端列表计算；「刷新账号池」按钮从假延时改为调用 `POST /account-profiles/aggregate`（或 refresh）。
4. **补管理能力**（已确认计划）：
   - 匹配账号预览表新增「最后刷新时间」列（读 `lastFetchedAt` / `lastAggregatedAt`）。
   - 「手动刷新账号资料」入口（复用现有「刷新账号池」按钮）。
5. **类型对齐**：新增 `src/api/accountProfiles.ts`（参考 `api/monitor.ts`），`MonitoringAccount` 类型改为与 `AccountProfileDto` 对齐（或直接复用）。

## 6. 成本控制

| 策略 | 落地 |
|---|---|
| 只刷活跃账号 | `isActive` 过滤；非活跃不进自动刷新 |
| 能批量就批量 | `batch_info_by_ids` 按 100 个一批 |
| TTL 去重 | 24h 内 `lastFetchedAt` 新鲜的账号跳过 |
| 靠近阈值优先 | 排序策略：`followers` / `avg*` 接近筛选阈值、或 `lastFetchedAt` 最旧的优先（见开放问题，可作二期） |
| 互动指标不调 API | 全部本地聚合 signals，零外部成本 |

## 7. 验证方案

1. **全量初始化**：上线时对现有 KOL 名单账号执行一次 `account_profiles` 初始化（静态资料批量刷 + 互动指标全量聚合），确认 `followers` / `region` / 互动均值落库。
2. **数据充分性**：确认 `signals` 表已有足够「近 7 天」帖子覆盖（KOL 雷达每 6h 采集一轮，累积约需数天；不足时可选做一次 7 天回溯采集，见开放问题）。
3. **24h 定时刷新**：验证活跃账号 `lastFetchedAt` 按时更新，非活跃账号不动，失败账号进入退避。
4. **一致性**：随机抽 3~5 个账号，手算近 7 天 posts/互动均值，与前端「匹配账号预览」展示一致。
5. **前端回归**：新建/编辑群组、手动纳入/排除、区域筛选、互动阈值筛选均正常；「最后刷新时间」正确展示。

## 8. 实施顺序（里程碑）

- **M0**：账号名单统一。`AccountProfile` 模型（含 `monitorEnabled` / `groupTag` / `joinedAt` / `source`）+ 迁移；`project_configs['x.trends.kolAccounts']` → `account_profiles` 一次性种子；调度器 handles 来源改读新表；`KolRadarSetting.tsx` 改行级 REST；清理 `project-config` 中账号相关代码（详见 3.5）。**已完成。**
- M1：`x-account-posts` normalize 补 `authorId` 落库（填充 `twitterUserId`）。**已完成。** `x-account-posts` 插件新增 `authorId` / `authorName` 落库，并用 `fetchUserInfo` 拿到的 userId 兜底，传播到 signal / evidence 的 metadata。
- M2：`AccountProfileAggregationService`（signals → account_profiles 聚合 + 自动发现新 handle）。**已完成。** 实现为 `AccountMetricsService`，纯函数 `aggregatePostSignals`（signals → 窗口内按作者聚合 → 自动发现 / 更新 / 清零过期）+ 7 项单测覆盖（含墓碑过滤、转发帖排除、postId 去重、宽口夹紧）。手动触发接口 `POST /account-profiles/metrics/refresh`。
- M3：`AccountProfileController` + 静态资料刷新服务（batch_info_by_ids + region 识别 + 退避）。**已完成。** `AccountProfileRefreshService.refreshActiveAccounts({intervalMs, batchSize, maxAccounts})`：取 `isActive=true` 且到期 / 未刷过 / 退避窗口外的账号；没 `twitterUserId` 的走单次 `/twitter/user/info?userName=`，有的按批（默认 100）走 `/twitter/user/batch_info_by_ids?userIds=`；region 用 `account-profile.region.ts` 的关键词规则识别（命中→区域+`regionSource='auto'`，未命中→null+`regionSource='auto'`）；人工 `regionSource='manual'` 不覆盖；失败累加 attempts，按 [1h, 3h, 6h, 12h, 24h, 24h…] 写入 `nextRetryAt`。表新增 `refreshAttemptCount` + `nextRetryAt` 字段（迁移 `20260908000400`）。无 `TWITTERAPI_IO_KEY` 时安全返回 `skippedMissingKey: true`。暴露 `POST /account-profiles/refresh`。
- M4：前端 `useAccountProfiles` + `getMatchedAccounts` 改造 + 匹配预览/刷新时间展示。**已完成。** `src/hooks/useAccountPool.ts` 提供模块级共享缓存 + `refresh()` 触发后端聚合；`CustomMonitoringGroups.tsx` 删掉 12 个 mock 账号，改用真实接口；区域选项 / 手动纳入排除 / 匹配预览全部从账号池动态计算；`lastUpdatedAt` 取代原 Mock 时间戳。`KolRadarSetting.tsx` 同时补了账号关键指标展示：粉丝量、近 7 天发帖 / 均 views / 均 likes、区域、最近活跃时间、资料更新时间、bio 提示，并新增「刷新账号资料」按钮。 
- M5：全量初始化 + 定时任务接线 + 验证清单跑通。**已完成。** ① `data-source-scheduler.service.ts` 注入 `AccountMetricsService`，KOL 雷达采集成功且 `rawItemCount>0` 时异步触发 `refreshEngagement()`；② 新增 `scripts/init-account-pool.ts`（`npm run init:account-pool`），跑一遍：先聚合 signals，再批量刷静态资料，并打印前/后行数；③ scheduler 已有的 setInterval（`DATA_SOURCE_SCHEDULER_ENABLED=false` 可关）作为兜底驱动器，周期内会自然调用 `runDueKolRadarCollection`。仍需运维侧：填 `TWITTERAPI_IO_KEY`、执行 `npm run prisma:migrate:deploy`、再 `npm run init:account-pool` 做冷启动。

## 9. 开放问题（待确认）

1. **转发帖（repost）是否计入「近 7 天互动」均值**：默认计入；若需排除，聚合时加 `postType <> 'repost'` 条件。
2. **「近 7 天」窗口数据的冷启动**：首次上线时 signals 可能没有 7 天历史。可选 A：对 KOL 名单账号做一次 `since = 7天前` 的回溯采集（走 `x-account-posts` 插件，maxPages 调大）；可选 B：渐进累积，先展示已有窗口数据。建议 A，否则筛选初期大量账号 `weeklyPosts=0`。
3. **账号池来源与「新建账号」入口**：账号池 = signals 已采集 handle（自动发现）+ 手动添加；是否需要在前端加「手动添加账号」入口（对应「新账号创建后立即刷新一次」），本期是否实现。
4. **靠近阈值优先**：需先知道「哪些筛选阈值」，阈值散落在各群组 filter 里；作为二期优化，M1~M5 先按「最旧 lastFetchedAt 优先」。
5. **region 自动识别规则库**：`location` 自由文本 → 区域的映射规则需要一套关键词表（国家/城市 → 区域），建议先做最小规则集，未知归「未知」。
