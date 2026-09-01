# 热点数据 MCP 外部 Agent 使用文档

## 1. 这个 MCP 服务提供什么

热点数据 MCP 服务用于把本系统采集、挖掘、整理后的热点数据提供给其他 Agent 或外部系统使用。

外部 Agent 不需要理解本系统内部数据库表结构，只需要通过 MCP 工具查询：

- 系统的数据语义和标签体系
- 热点事件列表
- 单个热点事件详情
- 支撑事件判断的证据链
- 原始 Signal 数据

第一阶段 MCP 服务只提供只读能力，不支持修改配置、触发采集、删除数据、创建事件或写入运营决策。

## 2. 调用地址

本地开发环境：

```text
POST http://localhost:3001/mcp
```

线上环境示例：

```text
POST http://34.94.189.76:6061/mcp
```

如果服务部署在域名后面，把 host 和端口替换成实际后端地址即可。

## 3. 鉴权方式

每次请求都必须携带 Bearer Token：

```text
Authorization: Bearer <HOTSPOT_MCP_API_KEY>
```

服务端通过环境变量配置：

```env
HOTSPOT_MCP_API_KEY=replace-with-real-mcp-api-key
```

注意：

- 不要把真实密钥提交到 GitHub。
- 不要把真实密钥写进公开文档、前端代码或日志。
- 如果怀疑密钥泄露，应该立刻更换环境变量并重启服务。

## 4. 外部 Agent 平台配置

如果对方的 Agent 平台支持远程 HTTP MCP Server，优先把下面这段配置给对方。

本地开发环境：

```json
{
  "mcpServers": {
    "hotspot": {
      "type": "http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer <HOTSPOT_MCP_API_KEY>"
      }
    }
  }
}
```

线上环境示例：

```json
{
  "mcpServers": {
    "hotspot": {
      "type": "http",
      "url": "http://34.94.189.76:6061/mcp",
      "headers": {
        "Authorization": "Bearer <HOTSPOT_MCP_API_KEY>"
      }
    }
  }
}
```

不同 Agent 平台的配置字段可能略有差异。如果它的界面不是粘贴整段 JSON，而是分字段填写，可以按下面填写：

| 字段 | 值 |
| --- | --- |
| Server name | `hotspot` |
| Transport / Type | `http` |
| URL | `http://34.94.189.76:6061/mcp` |
| Header name | `Authorization` |
| Header value | `Bearer <HOTSPOT_MCP_API_KEY>` |

## 5. 请求协议

接口使用 MCP over HTTP 的 JSON-RPC 请求。

初始化握手：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "external-agent",
      "version": "1.0.0"
    }
  }
}
```

返回示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "hotspot-agent-backend",
      "title": "Hotspot Agent MCP Server",
      "version": "0.1.0"
    },
    "instructions": "这是热点情报系统的只读 MCP 服务。"
  }
}
```

列出工具：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

返回结构：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": []
  }
}
```

调用工具：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_hot_events",
    "arguments": {
      "limit": 5
    }
  }
}
```

工具调用返回结构：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "供普通模型阅读的 JSON 文本"
      }
    ],
    "structuredContent": {
      "data": {}
    },
    "isError": false
  }
}
```

外部 Agent 调用时：

- 如果需要自然语言理解，读取 `result.content[0].text`。
- 如果需要稳定结构化数据，读取 `result.structuredContent.data`。

## 6. 可用工具

### 6.1 get_system_taxonomy

获取系统的数据语义、固定事件领域、固定来源标签和热度标签。

建议外部 Agent 第一次接入时先调用这个工具，用来理解返回字段的含义。

请求示例：

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-real-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_system_taxonomy","arguments":{}}}'
```

适合回答的问题：

- 当前系统有哪些数据对象？
- Event、Signal、Evidence 分别是什么意思？
- 事件领域有哪些固定值？
- 来源和热度标签有哪些固定值？

### 6.2 search_hot_events

查询热点事件列表。

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `query` | string | 否 | 按事件标题或摘要搜索 |
| `domains` | string[] | 否 | 按事件领域筛选 |
| `sources` | string[] | 否 | 按来源标签筛选 |
| `labels` | string[] | 否 | 按热度或辅助标签筛选 |
| `since` | string | 否 | 只返回该 ISO 时间之后更新的事件 |
| `limit` | number | 否 | 默认 20，最大 50 |

请求示例：

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-real-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_hot_events","arguments":{"limit":5}}}'
```

按领域筛选：

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-real-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_hot_events","arguments":{"domains":["Prediction Markets"],"limit":10}}}'
```

返回字段：

| 字段 | 说明 |
| --- | --- |
| `eventId` | 事件 ID，用于继续查询详情 |
| `title` | 中文事件标题 |
| `summary` | 中文事件摘要 |
| `domains` | 事件领域 |
| `sourceLabels` | 来源标签，例如 X Trend、Topic Circle |
| `heatLabels` | 热度标签，例如 Top5、Fast Rising |
| `triggerReason` | 事件形成的真实触发原因 |
| `confidence` | 置信度 |
| `status` | 事件状态 |
| `evidenceCount` | 证据数量 |
| `occurredAt` | 事实发生时间，可能为空 |
| `observedAt` | 事件首次进入系统的时间 |
| `updatedAt` | 事件最近更新时间 |

### 6.3 get_hot_event_detail

查询单个热点事件详情。

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `eventId` | string | 是 | 事件 ID |
| `includeRawSignals` | boolean | 否 | 预留字段，当前阶段默认不返回数据库裸数据 |

请求示例：

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-real-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_hot_event_detail","arguments":{"eventId":"replace-with-event-id"}}}'
```

返回内容：

- `event`：事件核心信息
- `evidence`：证据链，包含来源、账号、链接、发布时间、采集时间、指标
- `timeline`：事件相关时间线
- `promptContext`：已经拼装好的中文上下文，适合直接交给大模型继续分析

外部 Agent 如果要生成内容、判断承接角度、写分析报告，优先使用 `promptContext`。

### 6.4 search_signals

查询原始 Signal。

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `query` | string | 否 | 按 Signal 标题或摘要搜索 |
| `signalType` | string | 否 | 按 Signal 类型筛选 |
| `platform` | string | 否 | 按平台筛选，例如 `x`、`youtube` |
| `since` | string | 否 | 只返回该 ISO 时间之后观测到的信号 |
| `limit` | number | 否 | 默认 20，最大 50 |

请求示例：

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-real-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_signals","arguments":{"platform":"x","limit":10}}}'
```

返回字段：

| 字段 | 说明 |
| --- | --- |
| `signalId` | Signal ID |
| `signalType` | Signal 类型 |
| `platform` | 平台 |
| `sourceName` | 来源名称或账号名称 |
| `title` | Signal 标题 |
| `summary` | Signal 摘要 |
| `url` | 原始来源链接，可能为空 |
| `publishedAt` | 原始内容发布时间，可能为空 |
| `observedAt` | 系统观测到该 Signal 的时间 |
| `metrics` | 浏览、点赞、评论等公开指标 |
| `linkedEventIds` | 已关联的事件 ID |

## 7. 固定事件领域

当前固定事件领域如下：

- `AI`
- `Technology`
- `Politics & Elections`
- `Geopolitics & Conflict`
- `Macro & Financial Markets`
- `Crypto & Web3`
- `Prediction Markets`
- `Official Schedule`

外部 Agent 做筛选时，应优先使用这些固定值。

## 8. 固定来源与热度标签

当前固定标签如下：

- `X Trend`
- `Topic Circle`
- `Future Event`
- `Top5`
- `Fast Rising`
- `Multi-region`
- `第一方确认`
- `Re-entry`

注意：

- 标签只是事件特征，不等于触发原因。
- 真正的触发原因应读取 `triggerReason` 字段。
- 例如 `第一方确认` 表示证据里包含第一方权威账号，不代表事件一定是因为第一方账号触发。

## 9. 外部 Agent 推荐调用流程

### 场景一：回答“现在有什么热点？”

1. 调用 `search_hot_events`
2. 读取事件标题、摘要、领域、标签和触发原因
3. 如需证据，继续调用 `get_hot_event_detail`

### 场景二：围绕某个领域找选题

1. 调用 `get_system_taxonomy` 获取领域定义
2. 调用 `search_hot_events`，传入 `domains`
3. 对候选事件逐个调用 `get_hot_event_detail`
4. 使用 `promptContext` 生成选题建议

### 场景三：追溯原始来源

1. 调用 `search_signals`
2. 用 `platform`、`signalType`、`query` 缩小范围
3. 如果 Signal 已有关联事件，继续调用 `get_hot_event_detail`

## 10. 错误返回

未带鉴权或密钥错误时，HTTP 状态码为 `401`。

工具调用错误时，返回 JSON-RPC 风格错误：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "未找到指定 MCP 工具。",
    "data": {
      "code": "MCP_TOOL_NOT_FOUND",
      "retryable": false,
      "suggestion": "请先调用 tools/list 获取可用工具名称。"
    }
  }
}
```

外部 Agent 应优先读取：

- `error.code`
- `error.message`
- `error.data.code`
- `error.data.retryable`
- `error.data.suggestion`

## 11. 使用边界

当前 MCP 服务适合：

- 热点事件检索
- 证据链读取
- 原始 Signal 查询
- 事件上下文提供给其他 Agent
- 外部内容 Agent、分析 Agent、运营 Agent 作为数据源调用

当前 MCP 服务不适合：

- 修改系统配置
- 触发采集任务
- 删除或修复数据
- 创建热点事件
- 写入运营决策
- 替代后台管理 API

这些能力后续可以按权限分级逐步开放。
