# Hotspot Monitor V2 Backend

Hotspot Monitor V2 的新后端项目。

核心方向：

- 数据采集插件化。
- RawItem → Signal → Evidence 数据分层。
- Future Event Agent。
- Topic Watch Agent。
- Opportunity Mining Agent。
- Assignment Agent。
- Content Generation Agent。
- Performance Tracking。

架构文档位于：

```text
docs/hotspot-v2
```

实施计划：

```text
docs/hotspot-v2/IMPLEMENTATION_PLAN.md
```

## 模型配置

默认情况下服务可以启动，但 Agent 生成类接口会返回 `MODEL_PROVIDER_NOT_CONFIGURED`。

启用真实模型需要配置：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-5
```

`OPENAI_MODEL` 可不填，默认使用 `gpt-5`。如需代理或兼容网关，可以配置：

```text
OPENAI_BASE_URL=https://api.openai.com/v1
```

## 健康检查

```text
GET /health
```

返回内容包含：

- 数据库连接状态。
- 默认 Agent 工具注册数量和名称。
- OpenAI 模型 Provider 是否已配置。

## 演示数据

配置 `DATABASE_URL` 并完成 Prisma 迁移后，可以执行：

```bash
npm run db:seed
```

该命令会写入一组可重复执行的 demo 数据，包括：

- RawItem / Signal / Evidence
- TopicWatch / TopicCandidate
- Opportunity / Event
- AssignmentRun / AssignmentItem
- ContentTask / ContentDraft
- PublishedPost / PostMetricSnapshot

## Demo Agent Run

写入演示数据后，可以执行：

```bash
npm run demo:agent
```

该命令会：

- 读取 demo Signal / Evidence / TopicCandidate。
- 使用当前配置的 Agent Workflow Engine 运行一次 `opportunity_mining`。
- 输出 `runId`、最终结果和调试接口路径。

如果没有配置 `OPENAI_API_KEY`，脚本会输出失败结果，并返回可追踪的 `runId`；配置后会真实调用模型。

## Demo Pipeline

需要先执行：

```bash
npm run db:seed
```

然后执行：

```bash
npm run demo:pipeline
```

该命令会跑完整演示闭环：

```text
Signal / Evidence / TopicCandidate
→ Opportunity Mining Agent
→ Opportunity 落库
→ Assignment Agent
→ AssignmentRun / AssignmentItem 落库
→ ContentTask 创建
→ Content Generation Agent
→ ContentDraft 落库
```

脚本会输出每一步的业务 id 和 Agent Run id，方便继续通过 `/agent/runs/:id/steps` 查看模型每一步判断。
