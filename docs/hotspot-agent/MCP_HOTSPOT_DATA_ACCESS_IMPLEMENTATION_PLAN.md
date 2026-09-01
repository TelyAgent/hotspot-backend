# 热点数据 MCP 对外访问 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `hotspot-agent-backend` 内新增只读 MCP 服务，让外部 Agent 可以安全、稳定地查询热点事件、事件详情、原始 Signal 和系统数据语义。

**Architecture:** 第一阶段采用“后端内置 MCP 模块”方案，不单独部署新服务。MCP 层只做工具协议、鉴权、输入校验、DTO 转换和语义化输出，业务数据仍复用现有 Prisma、Repository 和 Service。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、TypeScript、Jest、`@modelcontextprotocol/sdk`。

**Spec:** `/Users/qmk/work/hotspot-monitor/hotspot-agent-backend/docs/hotspot-agent/MCP_HOTSPOT_DATA_ACCESS_ARCHITECTURE.md`

## Global Constraints

- MCP 第一阶段只读，不开放修改配置、触发采集、创建事件、删除数据和运营决策写操作。
- MCP 输出默认中文。
- MCP 不返回数据库裸结构、API Key、数据库连接信息、请求头、内部错误堆栈和未解释的中间状态。
- 列表工具默认 `limit = 20`，最大 `limit = 50`。
- 事件详情默认返回适合外部 Agent 使用的 `promptContext`。
- 外部调用必须通过 `Authorization: Bearer <HOTSPOT_MCP_API_KEY>` 鉴权。
- 工具返回的 `evidence` 必须尽量展示真实来源、账号、链接、发布时间、采集时间和指标，而不是只返回内部 ID。

---

## 1. 文件结构

### 新增文件

- `src/mcp/mcp.module.ts`：MCP 模块，注册 Controller、鉴权、工具注册表和只读数据服务。
- `src/mcp/mcp.controller.ts`：暴露 MCP over HTTP endpoint。
- `src/mcp/mcp-auth.guard.ts`：校验 `Authorization: Bearer`。
- `src/mcp/mcp-error.filter.ts`：把业务错误转换成 Agent 可理解的 MCP 错误。
- `src/mcp/mcp-tool-registry.service.ts`：注册和路由所有 MCP 工具。
- `src/mcp/mcp.types.ts`：MCP DTO、工具输入、工具输出和错误结构。
- `src/mcp/mcp-taxonomy.service.ts`：返回系统数据语义说明。
- `src/mcp/mcp-hot-event.service.ts`：查询热点事件列表和详情。
- `src/mcp/mcp-signal.service.ts`：查询原始 Signal。
- `src/mcp/tools/get-system-taxonomy.tool.ts`：`get_system_taxonomy` 工具。
- `src/mcp/tools/search-hot-events.tool.ts`：`search_hot_events` 工具。
- `src/mcp/tools/get-hot-event-detail.tool.ts`：`get_hot_event_detail` 工具。
- `src/mcp/tools/search-signals.tool.ts`：`search_signals` 工具。
- `src/mcp/__tests__/mcp-taxonomy.service.spec.ts`：系统语义工具测试。
- `src/mcp/__tests__/mcp-hot-event.service.spec.ts`：事件列表和事件详情 DTO 测试。
- `src/mcp/__tests__/mcp-signal.service.spec.ts`：Signal 查询 DTO 测试。
- `test/e2e/mcp.e2e-spec.ts`：MCP HTTP endpoint、鉴权和工具调用集成测试。

### 修改文件

- `package.json`：增加 `@modelcontextprotocol/sdk` 依赖。
- `package-lock.json`：同步依赖锁文件。
- `src/app.module.ts`：引入 `McpModule`。
- `src/opportunity/opportunity.repository.ts`：必要时增加 MCP 查询所需的只读方法，不改变现有接口行为。
- `src/signal/signal/signal.repository.ts`：扩展 `findMany` 的筛选能力，支持 `query`、`platform`、`since`。
- `.env.production.example`：增加 `HOTSPOT_MCP_API_KEY` 示例值，但不能写真实密钥。

---

## 2. Task 1: 安装 MCP SDK 并注册空模块

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app.module.ts`
- Create: `src/mcp/mcp.module.ts`
- Create: `src/mcp/mcp.controller.ts`
- Create: `test/e2e/mcp.e2e-spec.ts`

**Interfaces:**

- Produces: `McpModule`
- Produces: `POST /mcp`

- [ ] **Step 1: 写失败的 e2e 测试**

在 `test/e2e/mcp.e2e-spec.ts` 中新增：

```ts
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('MCP API', () => {
  let app: { init: () => Promise<void>; close: () => Promise<void>; getHttpServer: () => unknown };

  beforeEach(async () => {
    process.env.HOTSPOT_MCP_API_KEY = 'test-mcp-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.HOTSPOT_MCP_API_KEY;
  });

  it('rejects unauthenticated MCP calls', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
FAIL
Cannot find module 或 404
```

- [ ] **Step 3: 安装 MCP SDK**

Run:

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 4: 新增空 MCP 模块**

`src/mcp/mcp.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';

@Module({
  controllers: [McpController],
})
export class McpModule {}
```

`src/mcp/mcp.controller.ts`：

```ts
import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';

@Controller('mcp')
export class McpController {
  @Post()
  handle(@Body() _body: unknown) {
    throw new UnauthorizedException('MCP API key is required.');
  }
}
```

`src/app.module.ts`：

```ts
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    McpModule,
  ],
})
export class AppModule {}
```

实际修改时只在已有 `imports` 数组中追加 `McpModule`，不要覆盖其他模块。

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
PASS test/e2e/mcp.e2e-spec.ts
```

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json src/app.module.ts src/mcp test/e2e/mcp.e2e-spec.ts
git commit -m "feat: add mcp module shell"
```

---

## 3. Task 2: 增加 MCP 鉴权

**Files:**

- Create: `src/mcp/mcp-auth.guard.ts`
- Modify: `src/mcp/mcp.module.ts`
- Modify: `src/mcp/mcp.controller.ts`
- Modify: `test/e2e/mcp.e2e-spec.ts`
- Modify: `.env.production.example`

**Interfaces:**

- Consumes: `POST /mcp`
- Produces: `McpAuthGuard`
- Produces: `HOTSPOT_MCP_API_KEY`

- [ ] **Step 1: 写失败测试**

在 `test/e2e/mcp.e2e-spec.ts` 追加：

```ts
it('accepts MCP calls with a valid bearer token', async () => {
  const response = await request(app.getHttpServer())
    .post('/mcp')
    .set('Authorization', 'Bearer test-mcp-key')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    .expect(200);

  expect(response.body).toMatchObject({
    jsonrpc: '2.0',
    id: 1,
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
FAIL
expected 200, got 401
```

- [ ] **Step 3: 实现鉴权 Guard**

`src/mcp/mcp-auth.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('HOTSPOT_MCP_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('MCP API key is not configured.');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (value !== `Bearer ${expected}`) {
      throw new UnauthorizedException('Invalid MCP API key.');
    }

    return true;
  }
}
```

`src/mcp/mcp.controller.ts`：

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard';

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  @Post()
  handle(@Body() body: { id?: string | number }) {
    return {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: { tools: [] },
    };
  }
}
```

`src/mcp/mcp.module.ts` 注册 `McpAuthGuard`：

```ts
@Module({
  controllers: [McpController],
  providers: [McpAuthGuard],
})
export class McpModule {}
```

`.env.production.example` 增加：

```dotenv
HOTSPOT_MCP_API_KEY=replace-with-mcp-api-key
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交**

```bash
git add .env.production.example src/mcp test/e2e/mcp.e2e-spec.ts
git commit -m "feat: protect mcp endpoint with api key"
```

---

## 4. Task 3: 实现 MCP 工具注册表

**Files:**

- Create: `src/mcp/mcp.types.ts`
- Create: `src/mcp/mcp-tool-registry.service.ts`
- Modify: `src/mcp/mcp.module.ts`
- Modify: `src/mcp/mcp.controller.ts`
- Modify: `test/e2e/mcp.e2e-spec.ts`

**Interfaces:**

- Produces:

```ts
export interface McpToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: TInput): Promise<TResult> | TResult;
}
```

- Produces: `McpToolRegistryService.listTools()`
- Produces: `McpToolRegistryService.callTool(name, input)`

- [ ] **Step 1: 写失败测试**

在 `test/e2e/mcp.e2e-spec.ts` 增加：

```ts
it('returns the MCP tool list', async () => {
  const response = await request(app.getHttpServer())
    .post('/mcp')
    .set('Authorization', 'Bearer test-mcp-key')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    .expect(200);

  expect(response.body.result.tools).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'get_system_taxonomy',
        description: expect.any(String),
        inputSchema: expect.any(Object),
      }),
    ]),
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
FAIL
工具列表为空
```

- [ ] **Step 3: 定义 MCP 类型**

`src/mcp/mcp.types.ts`：

```ts
export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: TInput): Promise<TResult> | TResult;
}

export interface McpToolListItem {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
```

- [ ] **Step 4: 实现工具注册表**

`src/mcp/mcp-tool-registry.service.ts`：

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { McpToolDefinition, McpToolListItem } from './mcp.types';

@Injectable()
export class McpToolRegistryService {
  private readonly tools = new Map<string, McpToolDefinition>();

  register(tool: McpToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  listTools(): McpToolListItem[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, input: unknown) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`MCP tool not found: ${name}`);
    }
    return tool.execute(input);
  }
}
```

- [ ] **Step 5: Controller 支持 `tools/list` 和 `tools/call`**

`src/mcp/mcp.controller.ts` 核心逻辑：

```ts
@Post()
async handle(@Body() body: McpJsonRpcRequest) {
  if (body.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: { tools: this.registry.listTools() },
    };
  }

  if (body.method === 'tools/call') {
    const name = String(body.params?.name ?? '');
    const args = body.params?.arguments ?? {};
    return {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: await this.registry.callTool(name, args),
    };
  }

  throw new NotFoundException(`Unsupported MCP method: ${body.method}`);
}
```

- [ ] **Step 6: 临时注册 `get_system_taxonomy` 空工具**

在 `McpModule` 或注册表构造阶段注入一个临时工具：

```ts
this.registry.register({
  name: 'get_system_taxonomy',
  description: '获取热点系统的数据实体、Signal 类型、事件领域和标签含义。',
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ entities: [], signalTypes: [], eventDomains: [], sourceAndHeatLabels: [], confidenceLevels: [] }),
});
```

如果使用构造注册，后续 Task 4 会替换为正式工具类。

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 8: 提交**

```bash
git add src/mcp test/e2e/mcp.e2e-spec.ts
git commit -m "feat: add mcp tool registry"
```

---

## 5. Task 4: 实现 `get_system_taxonomy`

**Files:**

- Create: `src/mcp/mcp-taxonomy.service.ts`
- Create: `src/mcp/tools/get-system-taxonomy.tool.ts`
- Create: `src/mcp/__tests__/mcp-taxonomy.service.spec.ts`
- Modify: `src/mcp/mcp.module.ts`

**Interfaces:**

- Produces: `McpTaxonomyService.getTaxonomy()`
- Produces: MCP tool `get_system_taxonomy`

- [ ] **Step 1: 写失败单测**

`src/mcp/__tests__/mcp-taxonomy.service.spec.ts`：

```ts
import { McpTaxonomyService } from '../mcp-taxonomy.service';

describe('McpTaxonomyService', () => {
  it('returns fixed hotspot taxonomy for external agents', () => {
    const service = new McpTaxonomyService();

    expect(service.getTaxonomy()).toMatchObject({
      entities: expect.arrayContaining([
        expect.objectContaining({ name: 'Signal' }),
        expect.objectContaining({ name: 'Event' }),
        expect.objectContaining({ name: 'Evidence' }),
      ]),
      eventDomains: [
        'AI',
        'Technology',
        'Politics & Elections',
        'Geopolitics & Conflict',
        'Macro & Financial Markets',
        'Crypto & Web3',
        'Prediction Markets',
        'Official Schedule',
      ],
      sourceAndHeatLabels: expect.arrayContaining([
        expect.objectContaining({ name: 'X Trend' }),
        expect.objectContaining({ name: 'Topic Circle' }),
        expect.objectContaining({ name: 'Future Event' }),
        expect.objectContaining({ name: '第一方确认' }),
      ]),
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp-taxonomy.service.spec.ts
```

Expected:

```text
FAIL
Cannot find module '../mcp-taxonomy.service'
```

- [ ] **Step 3: 实现 Taxonomy Service**

`src/mcp/mcp-taxonomy.service.ts`：

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class McpTaxonomyService {
  getTaxonomy() {
    return {
      entities: [
        { name: 'Signal', description: '不同来源数据进入 Agent 系统前的统一信号。' },
        { name: 'Event', description: '系统经过热点挖掘和事实整理后形成的热点事件。' },
        { name: 'Evidence', description: '支撑 Event 的具体事实依据，优先包含真实来源链接。' },
        { name: 'Topic Watch', description: '对重点主题、圈层账号和相关帖子的持续追踪。' },
      ],
      signalTypes: [
        { code: 'x_trend', name: 'X 热搜', description: '来自 X 地区热搜榜的趋势信号。' },
        { code: 'topic_watch_post', name: '主题追踪帖子', description: '来自重点主题监控账号的帖子信号。' },
        { code: 'youtube_video', name: 'YouTube 视频', description: '来自 YouTube 爆款视频采集的视频信号。' },
        { code: 'future_event', name: '未来事件', description: '来自未来事件源和监控计划的事件信号。' },
      ],
      eventDomains: [
        'AI',
        'Technology',
        'Politics & Elections',
        'Geopolitics & Conflict',
        'Macro & Financial Markets',
        'Crypto & Web3',
        'Prediction Markets',
        'Official Schedule',
      ],
      sourceAndHeatLabels: [
        { code: 'x_trend', name: 'X Trend', description: '事件包含 X 热搜来源。' },
        { code: 'topic_circle', name: 'Topic Circle', description: '事件来自重点主题追踪。' },
        { code: 'future_event', name: 'Future Event', description: '事件来自未来事件监控。' },
        { code: 'top5', name: 'Top5', description: '热搜首次进入输入榜单前 5。' },
        { code: 'fast_rising', name: 'Fast Rising', description: '热搜排名在相邻快照间快速上升。' },
        { code: 'multi_region', name: 'Multi-region', description: '同一事件被多个地区或来源共同捕获。' },
        { code: 'first_party', name: '第一方确认', description: '证据中包含第一方权威账号或官方来源。' },
        { code: 're_entry', name: 'Re-entry', description: '事件重新进入观察窗口。' },
      ],
      confidenceLevels: [
        { code: 'high', description: '证据较充分，可以作为运营判断的重要参考。' },
        { code: 'medium', description: '证据可用，但仍需要关注缺失数据和风险提示。' },
        { code: 'low', description: '证据不足，只适合作为线索。' },
      ],
    };
  }
}
```

- [ ] **Step 4: 实现工具类**

`src/mcp/tools/get-system-taxonomy.tool.ts`：

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { McpTaxonomyService } from '../mcp-taxonomy.service';
import { McpToolRegistryService } from '../mcp-tool-registry.service';

@Injectable()
export class GetSystemTaxonomyTool implements OnModuleInit {
  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly taxonomyService: McpTaxonomyService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'get_system_taxonomy',
      description: '获取热点系统的数据实体、Signal 类型、事件领域、标签和置信度说明。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => this.taxonomyService.getTaxonomy(),
    });
  }
}
```

- [ ] **Step 5: 注册 provider**

`src/mcp/mcp.module.ts`：

```ts
providers: [
  McpAuthGuard,
  McpToolRegistryService,
  McpTaxonomyService,
  GetSystemTaxonomyTool,
]
```

- [ ] **Step 6: 运行测试**

Run:

```bash
npm test -- mcp-taxonomy.service.spec.ts mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: 提交**

```bash
git add src/mcp test/e2e/mcp.e2e-spec.ts
git commit -m "feat: expose hotspot taxonomy mcp tool"
```

---

## 6. Task 5: 实现 `search_hot_events`

**Files:**

- Create: `src/mcp/mcp-hot-event.service.ts`
- Create: `src/mcp/tools/search-hot-events.tool.ts`
- Create: `src/mcp/__tests__/mcp-hot-event.service.spec.ts`
- Modify: `src/mcp/mcp.module.ts`
- Modify: `src/opportunity/opportunity.repository.ts`

**Interfaces:**

- Produces:

```ts
searchHotEvents(input: {
  query?: string;
  domains?: string[];
  sources?: string[];
  labels?: string[];
  since?: string;
  limit?: number;
}): Promise<HotEventListItem[]>
```

- Produces: MCP tool `search_hot_events`

- [ ] **Step 1: 写失败单测**

`src/mcp/__tests__/mcp-hot-event.service.spec.ts`：

```ts
import { McpHotEventService } from '../mcp-hot-event.service';

describe('McpHotEventService', () => {
  it('returns semantic hot event list items with capped limit', async () => {
    const repository = {
      listEventsForMcp: jest.fn().mockResolvedValue([
        {
          id: 'event_1',
          title: 'OpenAI 发布新 API',
          summary: 'OpenAI 官方发布新 API，行业账号开始讨论。',
          labels: [
            { name: 'X Trend', category: 'source' },
            { name: 'Top5', category: 'heat' },
            { name: 'AI', category: 'domain' },
          ],
          confidence: 'high',
          status: 'suggested',
          evidenceRefs: ['evi_1', 'evi_2'],
          occurredAt: new Date('2026-08-31T10:00:00.000Z'),
          createdAt: new Date('2026-08-31T10:05:00.000Z'),
          updatedAt: new Date('2026-08-31T10:06:00.000Z'),
          sourceSummary: { triggerReason: '首次进入 X 热搜前 5。' },
        },
      ]),
    };
    const service = new McpHotEventService(repository as never);

    const result = await service.searchHotEvents({ limit: 100 });

    expect(repository.listEventsForMcp).toHaveBeenCalledWith({
      query: undefined,
      domains: undefined,
      sources: undefined,
      labels: undefined,
      since: undefined,
      limit: 50,
    });
    expect(result).toEqual([
      {
        eventId: 'event_1',
        title: 'OpenAI 发布新 API',
        summary: 'OpenAI 官方发布新 API，行业账号开始讨论。',
        domains: ['AI'],
        sourceLabels: ['X Trend'],
        heatLabels: ['Top5'],
        triggerReason: '首次进入 X 热搜前 5。',
        confidence: 'high',
        status: 'suggested',
        evidenceCount: 2,
        occurredAt: '2026-08-31T10:00:00.000Z',
        observedAt: '2026-08-31T10:05:00.000Z',
        updatedAt: '2026-08-31T10:06:00.000Z',
      },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp-hot-event.service.spec.ts
```

Expected:

```text
FAIL
Cannot find module '../mcp-hot-event.service'
```

- [ ] **Step 3: 在 Repository 增加查询方法**

在 `src/opportunity/opportunity.repository.ts` 增加：

```ts
listEventsForMcp(input: {
  query?: string;
  domains?: string[];
  sources?: string[];
  labels?: string[];
  since?: Date;
  limit: number;
}) {
  return this.prisma.event.findMany({
    where: {
      ...(input.query
        ? {
            OR: [
              { title: { contains: input.query, mode: 'insensitive' } },
              { summary: { contains: input.query, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(input.since ? { updatedAt: { gte: input.since } } : {}),
    },
    take: input.limit,
    orderBy: { updatedAt: 'desc' },
  });
}
```

第一期先在 service 层对 `domains`、`sources`、`labels` 做 JSON 标签过滤，避免写复杂数据库 JSON 查询。列表最大 50 条，内存过滤可接受。

- [ ] **Step 4: 实现 Hot Event Service**

`src/mcp/mcp-hot-event.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { OpportunityRepository } from '../opportunity/opportunity.repository';

const SOURCE_LABELS = new Set(['X Trend', 'Topic Circle', 'Future Event']);
const HEAT_LABELS = new Set(['Top5', 'Fast Rising', 'Multi-region', '第一方确认', 'Re-entry']);
const DOMAIN_LABELS = new Set([
  'AI',
  'Technology',
  'Politics & Elections',
  'Geopolitics & Conflict',
  'Macro & Financial Markets',
  'Crypto & Web3',
  'Prediction Markets',
  'Official Schedule',
]);

@Injectable()
export class McpHotEventService {
  constructor(private readonly repository: OpportunityRepository) {}

  async searchHotEvents(input: {
    query?: string;
    domains?: string[];
    sources?: string[];
    labels?: string[];
    since?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const events = await this.repository.listEventsForMcp({
      query: input.query,
      domains: input.domains,
      sources: input.sources,
      labels: input.labels,
      since: input.since ? new Date(input.since) : undefined,
      limit,
    });

    return events
      .map((event) => this.toListItem(event))
      .filter((event) => matchesAll(event.domains, input.domains))
      .filter((event) => matchesAll(event.sourceLabels, input.sources))
      .filter((event) => matchesAny([...event.sourceLabels, ...event.heatLabels], input.labels));
  }

  private toListItem(event: {
    id: string;
    title: string;
    summary: string;
    labels: unknown;
    confidence: string;
    status: string;
    evidenceRefs: unknown;
    occurredAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sourceSummary?: unknown;
  }) {
    const labelNames = extractLabelNames(event.labels);
    return {
      eventId: event.id,
      title: event.title,
      summary: event.summary,
      domains: labelNames.filter((label) => DOMAIN_LABELS.has(label)),
      sourceLabels: labelNames.filter((label) => SOURCE_LABELS.has(label)),
      heatLabels: labelNames.filter((label) => HEAT_LABELS.has(label)),
      triggerReason: extractTriggerReason(event.sourceSummary),
      confidence: event.confidence,
      status: event.status,
      evidenceCount: Array.isArray(event.evidenceRefs) ? event.evidenceRefs.length : 0,
      occurredAt: event.occurredAt?.toISOString(),
      observedAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}

function extractLabelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => {
      if (typeof label === 'string') return label;
      if (label && typeof label === 'object' && 'name' in label) return String(label.name);
      return '';
    })
    .filter(Boolean);
}

function extractTriggerReason(sourceSummary: unknown): string | undefined {
  if (!sourceSummary || typeof sourceSummary !== 'object' || !('triggerReason' in sourceSummary)) return undefined;
  return typeof sourceSummary.triggerReason === 'string' ? sourceSummary.triggerReason : undefined;
}

function matchesAll(values: string[], filters?: string[]) {
  return !filters?.length || filters.every((filter) => values.includes(filter));
}

function matchesAny(values: string[], filters?: string[]) {
  return !filters?.length || filters.some((filter) => values.includes(filter));
}
```

- [ ] **Step 5: 实现 MCP 工具**

`src/mcp/tools/search-hot-events.tool.ts`：

```ts
@Injectable()
export class SearchHotEventsTool implements OnModuleInit {
  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly hotEventService: McpHotEventService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'search_hot_events',
      description: '查询已形成的热点事件，可按关键词、事件领域、来源标签和热度标签筛选。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          domains: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' } },
          labels: { type: 'array', items: { type: 'string' } },
          since: { type: 'string' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
      execute: (input) => this.hotEventService.searchHotEvents(input as never),
    });
  }
}
```

- [ ] **Step 6: 运行测试**

Run:

```bash
npm test -- mcp-hot-event.service.spec.ts mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: 提交**

```bash
git add src/mcp src/opportunity/opportunity.repository.ts test/e2e/mcp.e2e-spec.ts
git commit -m "feat: expose hot event search mcp tool"
```

---

## 7. Task 6: 实现 `get_hot_event_detail`

**Files:**

- Modify: `src/mcp/mcp-hot-event.service.ts`
- Create: `src/mcp/tools/get-hot-event-detail.tool.ts`
- Modify: `src/mcp/__tests__/mcp-hot-event.service.spec.ts`
- Modify: `src/mcp/mcp.module.ts`
- Modify: `src/opportunity/opportunity.repository.ts`

**Interfaces:**

- Produces:

```ts
getHotEventDetail(input: {
  eventId: string;
  includeRawSignals?: boolean;
  includePromptContext?: boolean;
}): Promise<HotEventDetail>
```

- Produces: MCP tool `get_hot_event_detail`

- [ ] **Step 1: 写失败单测**

在 `mcp-hot-event.service.spec.ts` 增加：

```ts
it('returns event detail with evidence and prompt context', async () => {
  const repository = {
    findEventForMcp: jest.fn().mockResolvedValue({
      id: 'event_1',
      title: 'OpenAI 发布新 API',
      summary: 'OpenAI 官方发布新 API。',
      labels: [{ name: 'AI' }, { name: 'X Trend' }],
      confidence: 'high',
      status: 'suggested',
      evidenceRefs: ['evi_1'],
      missingData: [],
      riskNotes: ['不要把市场概率写成事实。'],
      occurredAt: new Date('2026-08-31T10:00:00.000Z'),
      createdAt: new Date('2026-08-31T10:05:00.000Z'),
      updatedAt: new Date('2026-08-31T10:06:00.000Z'),
      sourceSummary: { triggerReason: '首次进入 X 热搜前 5。' },
    }),
    listEvidenceForMcp: jest.fn().mockResolvedValue([
      {
        id: 'evi_1',
        sourceType: 'x_post',
        sourceName: 'OpenAI',
        authorHandle: 'OpenAI',
        text: 'OpenAI announces a new API.',
        url: 'https://x.com/OpenAI/status/1',
        publishedAt: new Date('2026-08-31T10:00:00.000Z'),
        observedAt: new Date('2026-08-31T10:05:00.000Z'),
        metrics: { views: 10000 },
      },
    ]),
  };
  const service = new McpHotEventService(repository as never);

  const detail = await service.getHotEventDetail({ eventId: 'event_1' });

  expect(detail.event.title).toBe('OpenAI 发布新 API');
  expect(detail.evidence[0]).toMatchObject({
    evidenceId: 'evi_1',
    source: 'x_post',
    authorHandle: 'OpenAI',
    url: 'https://x.com/OpenAI/status/1',
  });
  expect(detail.promptContext).toContain('【事件】');
  expect(detail.promptContext).toContain('OpenAI 发布新 API');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp-hot-event.service.spec.ts
```

Expected:

```text
FAIL
getHotEventDetail is not a function
```

- [ ] **Step 3: 增加 Repository 方法**

在 `OpportunityRepository` 增加：

```ts
findEventForMcp(eventId: string) {
  return this.prisma.event.findUnique({
    where: { id: eventId },
  });
}

listEvidenceForMcp(evidenceRefs: string[]) {
  return this.prisma.evidence.findMany({
    where: { id: { in: evidenceRefs } },
    orderBy: { observedAt: 'asc' },
  });
}
```

如果当前 Prisma 模型中证据表名或字段名不同，按 `prisma/schema.prisma` 中实际模型调整，但输出 DTO 字段名保持本计划定义。

- [ ] **Step 4: 实现详情转换**

在 `McpHotEventService` 增加：

```ts
async getHotEventDetail(input: {
  eventId: string;
  includeRawSignals?: boolean;
  includePromptContext?: boolean;
}) {
  const event = await this.repository.findEventForMcp(input.eventId);
  if (!event) {
    throw new DomainError('未找到指定热点事件。', 'HOT_EVENT_NOT_FOUND', { eventId: input.eventId });
  }

  const evidenceRefs = Array.isArray(event.evidenceRefs) ? event.evidenceRefs.map(String) : [];
  const evidence = await this.repository.listEvidenceForMcp(evidenceRefs);
  const eventDto = this.toListItem(event);

  const detail = {
    event: eventDto,
    evidence: evidence.map(toEvidenceDto),
    timeline: buildTimeline(eventDto, evidence),
    missingData: Array.isArray(event.missingData) ? event.missingData.map(String) : [],
    riskNotes: Array.isArray(event.riskNotes) ? event.riskNotes.map(String) : [],
    promptContext: undefined as string | undefined,
  };

  if (input.includePromptContext !== false) {
    detail.promptContext = buildPromptContext(detail);
  }

  return detail;
}
```

辅助函数：

```ts
function buildPromptContext(detail: {
  event: { title: string; summary: string; domains: string[]; triggerReason?: string };
  evidence: Array<{ source: string; authorHandle?: string; url?: string; summary?: string; text?: string; publishedAt?: string }>;
  riskNotes: string[];
}) {
  const evidenceText = detail.evidence
    .map((item, index) => `${index + 1}. ${item.authorHandle ? `@${item.authorHandle} ` : ''}${item.summary ?? item.text ?? ''}${item.url ? `，链接：${item.url}` : ''}`)
    .join('\n');

  return [
    '【事件】',
    `标题：${detail.event.title}`,
    `摘要：${detail.event.summary}`,
    `领域：${detail.event.domains.join('、') || '未标注'}`,
    detail.event.triggerReason ? `触发原因：${detail.event.triggerReason}` : undefined,
    '',
    '【证据】',
    evidenceText || '暂无可展示证据。',
    '',
    '【风险】',
    detail.riskNotes.join('\n') || '暂无风险提示。',
  ].filter((line) => line !== undefined).join('\n');
}
```

- [ ] **Step 5: 实现 MCP 工具**

`src/mcp/tools/get-hot-event-detail.tool.ts`：

```ts
@Injectable()
export class GetHotEventDetailTool implements OnModuleInit {
  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly hotEventService: McpHotEventService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'get_hot_event_detail',
      description: '获取单个热点事件的完整中文上下文、证据链、时间线、风险提示和 promptContext。',
      inputSchema: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'string' },
          includeRawSignals: { type: 'boolean' },
          includePromptContext: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      execute: (input) => this.hotEventService.getHotEventDetail(input as never),
    });
  }
}
```

- [ ] **Step 6: 运行测试**

Run:

```bash
npm test -- mcp-hot-event.service.spec.ts mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: 提交**

```bash
git add src/mcp src/opportunity/opportunity.repository.ts
git commit -m "feat: expose hot event detail mcp tool"
```

---

## 8. Task 7: 实现 `search_signals`

**Files:**

- Create: `src/mcp/mcp-signal.service.ts`
- Create: `src/mcp/tools/search-signals.tool.ts`
- Create: `src/mcp/__tests__/mcp-signal.service.spec.ts`
- Modify: `src/mcp/mcp.module.ts`
- Modify: `src/signal/signal/signal.repository.ts`

**Interfaces:**

- Produces:

```ts
searchSignals(input: {
  signalType?: string;
  platform?: string;
  query?: string;
  since?: string;
  limit?: number;
}): Promise<SignalListItem[]>
```

- Produces: MCP tool `search_signals`

- [ ] **Step 1: 写失败单测**

`src/mcp/__tests__/mcp-signal.service.spec.ts`：

```ts
import { McpSignalService } from '../mcp-signal.service';

describe('McpSignalService', () => {
  it('returns semantic signal list items', async () => {
    const repository = {
      findManyForMcp: jest.fn().mockResolvedValue([
        {
          id: 'sig_1',
          signalType: 'topic_watch_post',
          sourceType: 'x',
          title: 'Polymarket 讨论预测市场',
          summary: 'Polymarket 发布了预测市场相关帖子。',
          url: 'https://x.com/Polymarket/status/1',
          publishedAt: new Date('2026-08-31T10:00:00.000Z'),
          observedAt: new Date('2026-08-31T10:05:00.000Z'),
          metrics: { views: 428000 },
          metadata: { linkedEventIds: ['event_1'], authorHandle: 'Polymarket' },
        },
      ]),
    };
    const service = new McpSignalService(repository as never);

    const result = await service.searchSignals({ limit: 5 });

    expect(result).toEqual([
      {
        signalId: 'sig_1',
        signalType: 'topic_watch_post',
        platform: 'x',
        sourceName: 'Polymarket',
        title: 'Polymarket 讨论预测市场',
        summary: 'Polymarket 发布了预测市场相关帖子。',
        url: 'https://x.com/Polymarket/status/1',
        publishedAt: '2026-08-31T10:00:00.000Z',
        observedAt: '2026-08-31T10:05:00.000Z',
        metrics: { views: 428000 },
        linkedEventIds: ['event_1'],
      },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp-signal.service.spec.ts
```

Expected:

```text
FAIL
Cannot find module '../mcp-signal.service'
```

- [ ] **Step 3: 扩展 Signal Repository**

`src/signal/signal/signal.repository.ts` 增加：

```ts
async findManyForMcp(input: {
  take: number;
  signalType?: string;
  platform?: string;
  query?: string;
  since?: Date;
}): Promise<Signal[]> {
  return this.prisma.signal.findMany({
    where: {
      ...(input.signalType ? { signalType: input.signalType } : {}),
      ...(input.platform ? { sourceType: input.platform } : {}),
      ...(input.since ? { observedAt: { gte: input.since } } : {}),
      ...(input.query
        ? {
            OR: [
              { title: { contains: input.query, mode: 'insensitive' } },
              { summary: { contains: input.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    take: input.take,
    orderBy: { observedAt: 'desc' },
  }) as Promise<Signal[]>;
}
```

- [ ] **Step 4: 实现 Signal Service**

`src/mcp/mcp-signal.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { SignalRepository } from '../signal/signal/signal.repository';

@Injectable()
export class McpSignalService {
  constructor(private readonly signalRepository: SignalRepository) {}

  async searchSignals(input: {
    signalType?: string;
    platform?: string;
    query?: string;
    since?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const signals = await this.signalRepository.findManyForMcp({
      take: limit,
      signalType: input.signalType,
      platform: input.platform,
      query: input.query,
      since: input.since ? new Date(input.since) : undefined,
    });

    return signals.map((signal) => {
      const metadata = isRecord(signal.metadata) ? signal.metadata : {};
      return {
        signalId: signal.id,
        signalType: signal.signalType,
        platform: signal.sourceType,
        sourceName: typeof metadata.authorHandle === 'string' ? metadata.authorHandle : undefined,
        title: signal.title,
        summary: signal.summary,
        url: signal.url,
        publishedAt: signal.publishedAt?.toISOString(),
        observedAt: signal.observedAt.toISOString(),
        metrics: isRecord(signal.metrics) ? signal.metrics : undefined,
        linkedEventIds: Array.isArray(metadata.linkedEventIds) ? metadata.linkedEventIds.map(String) : [],
      };
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
```

- [ ] **Step 5: 实现 MCP 工具**

`src/mcp/tools/search-signals.tool.ts`：

```ts
@Injectable()
export class SearchSignalsTool implements OnModuleInit {
  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly signalService: McpSignalService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'search_signals',
      description: '查询原始或标准化 Signal，可按信号类型、平台、关键词和时间过滤。',
      inputSchema: {
        type: 'object',
        properties: {
          signalType: { type: 'string' },
          platform: { type: 'string' },
          query: { type: 'string' },
          since: { type: 'string' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
      execute: (input) => this.signalService.searchSignals(input as never),
    });
  }
}
```

- [ ] **Step 6: 运行测试**

Run:

```bash
npm test -- mcp-signal.service.spec.ts mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: 提交**

```bash
git add src/mcp src/signal/signal/signal.repository.ts
git commit -m "feat: expose signal search mcp tool"
```

---

## 9. Task 8: 标准化 MCP 错误返回

**Files:**

- Create: `src/mcp/mcp-error.filter.ts`
- Modify: `src/mcp/mcp.controller.ts`
- Modify: `test/e2e/mcp.e2e-spec.ts`

**Interfaces:**

- Produces: JSON-RPC 风格错误：

```ts
{
  jsonrpc: '2.0',
  id: string | number | null,
  error: {
    code: string,
    message: string,
    retryable: boolean,
    suggestion?: string
  }
}
```

- [ ] **Step 1: 写失败测试**

在 `mcp.e2e-spec.ts` 增加：

```ts
it('returns agent-readable error for unknown tools', async () => {
  const response = await request(app.getHttpServer())
    .post('/mcp')
    .set('Authorization', 'Bearer test-mcp-key')
    .send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'missing_tool', arguments: {} },
    })
    .expect(200);

  expect(response.body).toEqual({
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: 'MCP_TOOL_NOT_FOUND',
      message: '未找到指定 MCP 工具。',
      retryable: false,
      suggestion: '请先调用 tools/list 获取可用工具名称。',
    },
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
FAIL
expected 200, got 404
```

- [ ] **Step 3: 在 Controller 捕获工具错误**

在 `McpController.handle` 中包一层：

```ts
try {
  return await this.handleRequest(body);
} catch (error) {
  return {
    jsonrpc: '2.0',
    id: body.id ?? null,
    error: normalizeMcpError(error),
  };
}
```

实现：

```ts
function normalizeMcpError(error: unknown) {
  if (error instanceof NotFoundException) {
    return {
      code: 'MCP_TOOL_NOT_FOUND',
      message: '未找到指定 MCP 工具。',
      retryable: false,
      suggestion: '请先调用 tools/list 获取可用工具名称。',
    };
  }

  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'MCP 工具调用失败。',
    retryable: true,
  };
}
```

- [ ] **Step 4: 运行测试**

Run:

```bash
npm test -- mcp.e2e-spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交**

```bash
git add src/mcp test/e2e/mcp.e2e-spec.ts
git commit -m "feat: normalize mcp tool errors"
```

---

## 10. Task 9: 增加 MCP 契约测试

**Files:**

- Create: `src/mcp/__tests__/mcp-contract.spec.ts`
- Modify: `src/mcp/mcp.types.ts`

**Interfaces:**

- Protects: `search_hot_events` 返回字段。
- Protects: `get_hot_event_detail` 返回字段。
- Protects: `search_signals` 返回字段。
- Protects: `get_system_taxonomy` 返回字段。

- [ ] **Step 1: 写契约测试**

`src/mcp/__tests__/mcp-contract.spec.ts`：

```ts
import {
  HOT_EVENT_LIST_REQUIRED_KEYS,
  HOT_EVENT_DETAIL_REQUIRED_KEYS,
  SIGNAL_LIST_REQUIRED_KEYS,
  SYSTEM_TAXONOMY_REQUIRED_KEYS,
} from '../mcp.types';

describe('MCP output contracts', () => {
  it('documents stable hot event list keys', () => {
    expect(HOT_EVENT_LIST_REQUIRED_KEYS).toEqual([
      'eventId',
      'title',
      'summary',
      'domains',
      'sourceLabels',
      'heatLabels',
      'confidence',
      'status',
      'evidenceCount',
      'updatedAt',
    ]);
  });

  it('documents stable hot event detail keys', () => {
    expect(HOT_EVENT_DETAIL_REQUIRED_KEYS).toEqual([
      'event',
      'evidence',
      'timeline',
      'missingData',
      'riskNotes',
      'promptContext',
    ]);
  });

  it('documents stable signal list keys', () => {
    expect(SIGNAL_LIST_REQUIRED_KEYS).toEqual([
      'signalId',
      'signalType',
      'observedAt',
      'linkedEventIds',
    ]);
  });

  it('documents stable system taxonomy keys', () => {
    expect(SYSTEM_TAXONOMY_REQUIRED_KEYS).toEqual([
      'entities',
      'signalTypes',
      'eventDomains',
      'sourceAndHeatLabels',
      'confidenceLevels',
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- mcp-contract.spec.ts
```

Expected:

```text
FAIL
has no exported member
```

- [ ] **Step 3: 导出契约常量**

`src/mcp/mcp.types.ts`：

```ts
export const HOT_EVENT_LIST_REQUIRED_KEYS = [
  'eventId',
  'title',
  'summary',
  'domains',
  'sourceLabels',
  'heatLabels',
  'confidence',
  'status',
  'evidenceCount',
  'updatedAt',
] as const;

export const HOT_EVENT_DETAIL_REQUIRED_KEYS = [
  'event',
  'evidence',
  'timeline',
  'missingData',
  'riskNotes',
  'promptContext',
] as const;

export const SIGNAL_LIST_REQUIRED_KEYS = [
  'signalId',
  'signalType',
  'observedAt',
  'linkedEventIds',
] as const;

export const SYSTEM_TAXONOMY_REQUIRED_KEYS = [
  'entities',
  'signalTypes',
  'eventDomains',
  'sourceAndHeatLabels',
  'confidenceLevels',
] as const;
```

- [ ] **Step 4: 运行测试**

Run:

```bash
npm test -- mcp-contract.spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交**

```bash
git add src/mcp/__tests__/mcp-contract.spec.ts src/mcp/mcp.types.ts
git commit -m "test: lock mcp output contracts"
```

---

## 11. Task 10: 增加接入说明文档

**Files:**

- Create: `docs/hotspot-agent/MCP_EXTERNAL_AGENT_INTEGRATION_GUIDE.md`

**Interfaces:**

- Produces: 外部 Agent 接入说明。

- [ ] **Step 1: 写接入文档**

文档内容必须包含：

```md
# 外部 Agent 接入热点 MCP 指南

## 1. Endpoint

生产环境：

```text
POST http://<server-host>:6061/mcp
```

## 2. 鉴权

```text
Authorization: Bearer <HOTSPOT_MCP_API_KEY>
```

## 3. 查看可用工具

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

## 4. 查询热点事件

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_hot_events",
    "arguments": {
      "domains": ["AI"],
      "limit": 10
    }
  }
}
```

## 5. 获取事件详情

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_hot_event_detail",
    "arguments": {
      "eventId": "event_xxx",
      "includePromptContext": true
    }
  }
}
```

## 6. 使用边界

- MCP 第一阶段只读。
- 外部 Agent 不应该把预测市场概率、账号观点或系统判断写成事实。
- 外部 Agent 生成内容时必须优先引用 `evidence` 中的真实来源链接。
```

- [ ] **Step 2: 检查文档无真实密钥**

Run:

```bash
rg -n "sk-|OPENAI_API_KEY=|postgresql://.*:" docs/hotspot-agent/MCP_EXTERNAL_AGENT_INTEGRATION_GUIDE.md
```

Expected:

```text
无输出
```

- [ ] **Step 3: 提交**

```bash
git add docs/hotspot-agent/MCP_EXTERNAL_AGENT_INTEGRATION_GUIDE.md
git commit -m "docs: add external agent mcp integration guide"
```

---

## 12. Task 11: 全量验证

**Files:**

- No code files.

**Interfaces:**

- Verifies: 后端构建、单测、MCP e2e、类型检查。

- [ ] **Step 1: Prisma Client 生成**

Run:

```bash
npm run prisma:generate
```

Expected:

```text
Generated Prisma Client
```

- [ ] **Step 2: 后端构建**

Run:

```bash
npm run build
```

Expected:

```text
nest build
退出码 0
```

- [ ] **Step 3: MCP 相关测试**

Run:

```bash
npm test -- mcp
```

Expected:

```text
所有 MCP 相关测试 PASS
```

- [ ] **Step 4: 后端全量测试**

Run:

```bash
npm test
```

Expected:

```text
所有测试 PASS
```

如果本地沙箱环境出现 `listen EPERM 0.0.0.0`，使用非沙箱环境重跑，因为这是 e2e 监听端口权限问题，不是业务断言失败。

- [ ] **Step 5: 手动 curl 验证工具列表**

Run:

```bash
curl -s http://localhost:6061/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-mcp-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_system_taxonomy"
      }
    ]
  }
}
```

- [ ] **Step 6: 手动 curl 验证热点查询**

Run:

```bash
curl -s http://localhost:6061/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-mcp-key' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_hot_events","arguments":{"limit":5}}}'
```

Expected:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": []
}
```

如果数据库已有事件，`result` 可以不是空数组，但每个元素必须包含 `eventId`、`title`、`summary`、`domains`、`sourceLabels`、`heatLabels`、`confidence`、`status`、`evidenceCount`、`updatedAt`。

- [ ] **Step 7: 提交验证修正**

如果验证过程中修了问题：

```bash
git add src/mcp src/opportunity src/signal docs package.json package-lock.json
git commit -m "fix: stabilize mcp hotspot data access"
```

如果没有修正，不需要提交。

---

## 13. 自检结果

- Spec 覆盖：本计划覆盖第一期只读 MCP、工具注册、鉴权、热点事件查询、事件详情、Signal 查询、系统语义说明、错误结构、接入文档和验证。
- 明确暂不实现：`get_topic_watch_posts`、`get_youtube_breakout_videos`、`get_future_events`、运营决策相关 MCP 工具，这些放到第二期。
- 类型一致性：计划统一使用 `eventId`、`signalId`、`sourceLabels`、`heatLabels`、`triggerReason`、`evidence`、`promptContext`。
- 安全边界：第一期只读，使用 `HOTSPOT_MCP_API_KEY`，不暴露真实密钥和数据库连接。

## 14. 执行建议

Plan complete and saved to `docs/hotspot-agent/MCP_HOTSPOT_DATA_ACCESS_IMPLEMENTATION_PLAN.md`. Two execution options:

1. **Subagent-Driven（推荐）**：每个 Task 派一个独立子任务实现，我在主线程做审查和验证。
2. **Inline Execution**：我在当前会话里按 Task 顺序实现，每完成一个阶段跑测试。

建议选择 **Inline Execution**，因为这一期改动集中在后端 MCP 模块，文件边界清楚，当前会话已经有足够上下文。
