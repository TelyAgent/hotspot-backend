# System Copilot Agent 独立服务实现计划

## 1. 本阶段目标

第一阶段先在当前 `hotspot-v2-backend` 内实现逻辑独立的 Copilot API，而不是完整替换现有后台助手。

目标是跑通：

```text
当前后端内的逻辑独立 Copilot 模块
→ 会话接口
→ Agent Run 记录
→ 工具注册
→ 工具调用
→ 待确认操作
→ 用户确认后执行写工具
→ 审计记录
```

本阶段交付当前项目内的新模块：

```text
hotspot-v2-backend/src/copilot
```

## 2. 本阶段不做什么

暂不做：

- 不接入全部 Hotspot V2 业务工具。
- 不做复杂多租户权限。
- 不做外部 OAuth。
- 不做浏览器自动化。
- 不做生产部署脚本。
- 不直接替换当前前端助手入口。

先把独立服务边界和核心协议跑通。后续如果需要物理拆服务，可以基于这套 API 和数据边界迁移。

## 3. 技术栈

```text
NestJS
TypeScript
Prisma
PostgreSQL
Jest
OpenAI Responses API
当前已有 LangGraph AgentWorkflowEngine
```

第一阶段复用当前已有 Agent Loop：

```text
Model step
→ tool_call
→ Tool Gateway
→ tool result
→ Model step
→ final_decision
```

接口和数据结构按以后接 LangGraph 的形态设计。

## 4. 当前项目目录结构

```text
hotspot-v2-backend/
  prisma/
    schema.prisma
  src/
    app.module.ts
    copilot/
      copilot.controller.ts
      copilot.service.ts
      copilot.types.ts
    agent/
      workflow-engine/
      tool-registry/
      model-provider/
      run-log/
    assistant/
      assistant.service.ts
  test/
    unit/
      copilot/
    e2e/
```

## 5. 数据模型

### 5.1 CopilotSession

保存一次对话会话。

核心字段：

```text
id
tenantId
userId
client
title
status
metadata
createdAt
updatedAt
```

### 5.2 CopilotMessage

保存用户和助手消息。

核心字段：

```text
id
sessionId
role
content
metadata
createdAt
```

### 5.3 AgentRun

保存一次 Agent 执行。

核心字段：

```text
沿用当前已有 `AgentRun`，通过 `agentType=assistant` 和 `goal` 保存 Copilot 运行上下文。
```

### 5.4 AgentToolCall

保存工具调用记录。

核心字段：

```text
沿用当前已有 `AgentToolCall`。
```

### 5.5 CopilotProposedAction

保存待确认动作。

核心字段：

```text
id
agentRunId
sessionId
tenantId
userId
tool
summary
arguments
status
requiresConfirmation
confirmedBy
confirmedAt
executedAt
result
errorMessage
createdAt
updatedAt
```

### 5.6 ToolRegistration

第一阶段暂不新增独立工具注册表，复用当前内存态 `ToolRegistryService`。

核心字段：

```text
id
name
ownerService
description
permission
inputSchema
outputSchema
endpoint
authPolicy
status
createdAt
updatedAt
```

### 5.7 CopilotAuditLog

保存写操作审计。

核心字段：

```text
id
tenantId
userId
actionId
tool
operation
before
after
metadata
createdAt
```

## 6. API

### 6.1 Chat

```text
POST /copilot/chat
```

职责：

- 创建或复用会话。
- 保存用户消息。
- 调用 Agent Orchestrator。
- 保存助手消息。
- 返回中文回答和待确认操作。

### 6.2 Confirm Action

```text
POST /copilot/actions/:actionId/confirm
```

职责：

- 校验动作存在。
- 校验状态为 pending。
- 校验工具权限。
- 执行写工具。
- 保存执行结果和审计记录。

### 6.3 Reject Action

```text
POST /copilot/actions/:actionId/reject
```

职责：

- 将 pending action 标记为 rejected。
- 记录拒绝人和拒绝原因。

### 6.4 List Tools

```text
GET /copilot/tools
```

职责：

- 返回当前可用工具。
- 用于调试和未来外部系统接入。

## 7. 工具协议

工具权限：

```text
read
suggest_write
confirmed_write
high_risk
```

工具调用原则：

- `read` 可以由 Agent 直接调用。
- `suggest_write` 只能生成草稿。
- `confirmed_write` 必须生成 `ProposedAction`，用户确认后执行。
- `high_risk` 第一阶段不执行。

第一阶段工具：

```text
topicWatch.list
signal.search
event.findSimilar
evidence.search
以及当前 Agent ToolRegistryService 已注册工具
```

写操作第一阶段复用当前 `AssistantService.executeTool` 的受控工具。

## 8. Agent 输出协议

模型只能输出两类结构：

### 8.1 工具调用

```json
{
  "type": "tool_call",
  "toolName": "mock.config.list",
  "reason": "需要读取当前配置",
  "arguments": {},
  "requestedFields": ["items"]
}
```

### 8.2 最终决策

```json
{
  "type": "final_decision",
  "decision": {
    "message": "我查到了当前配置。",
    "usedTools": ["mock.config.list"],
    "proposedActions": [],
    "missingData": [],
    "suggestedNextSteps": []
  }
}
```

## 9. 实施任务

### 任务一：Copilot 模块骨架

在 `hotspot-v2-backend/src/copilot` 创建 Controller、Service、Types，并挂到 `AppModule`。

验收：

- TypeScript 可以编译。
- Jest 可以运行。
- `/copilot/tools` 返回当前工具列表。

### 任务二：Prisma 数据模型

扩展当前 Prisma schema，包含 Copilot 会话、消息、待确认动作和审计表；Agent Run 和工具调用沿用已有表。

验收：

- `prisma generate` 可以执行。
- schema 字段与文档一致。

### 任务三：工具注册和工具网关

复用当前已有：

```text
AgentModule
ToolRegistryService
ToolExecutorService
CoreAgentToolsService
AssistantService.executeTool
```

验收：

- 可以列出工具。
- Copilot 可以通过当前工具注册表暴露可用工具。
- 写操作必须落到 CopilotProposedAction 等待确认。

### 任务四：Agent Orchestrator

复用当前 `AGENT_WORKFLOW_ENGINE`，Copilot 负责传入会话、用户、客户端和 intent hint。

验收：

- Agent 返回 `final_decision` 后，Copilot 能提取 message、usedTools、missingData、suggestedNextSteps。
- Agent 返回 proposedActions 后，Copilot 能保存为 pending action。

### 任务五：Copilot Chat

实现 `/copilot/chat`。

验收：

- 保存用户消息。
- 创建 Agent Run。
- 返回助手回答。
- 返回待确认操作。

### 任务六：确认动作和审计

实现：

```text
POST /copilot/actions/:actionId/confirm
POST /copilot/actions/:actionId/reject
```

验收：

- pending action 可以确认执行。
- 执行后记录 result。
- 执行后写入 CopilotAuditLog。
- rejected action 不会执行。

### 任务七：测试与文档

补充单测和 e2e。

验收：

- 工具注册测试通过。
- Agent Loop 测试通过。
- Chat API 测试通过。
- Action Confirm API 测试通过。
- README 写明启动方式和环境变量。

## 10. 第一阶段完成标准

第一阶段完成后，应该可以做到：

```text
curl /copilot/chat
→ Agent 调用 topicWatch.list 等只读工具
→ 返回当前配置

curl /copilot/chat
→ Agent 生成添加监控账号等 ProposedAction
→ 用户 confirm
→ 服务执行写工具
→ 写入 CopilotAuditLog
```

这证明独立 Agent 服务的核心闭环已经成立。

## 11. 下一阶段

第二阶段接入真实 Hotspot V2 工具：

- 主题圈配置读取。
- 主题圈账号添加。
- Signal 查询。
- Event 查询。
- Evidence 查询。
- 规则包读取和草稿修改。
- 采集状态诊断。

第二阶段开始后，当前后台助手可以改为调用当前后端暴露的 `/copilot` API；其他系统也可以通过同一套接口访问。
