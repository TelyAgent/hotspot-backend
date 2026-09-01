# 热点数据 MCP 接入说明

## 接入地址

后端启动后，MCP over HTTP 入口为：

```text
POST /mcp
```

生产环境需要通过请求头鉴权：

```text
Authorization: Bearer <HOTSPOT_MCP_API_KEY>
```

`HOTSPOT_MCP_API_KEY` 由服务端环境变量配置，不能提交真实密钥到代码仓库。

## 当前工具

### get_system_taxonomy

获取热点系统的数据语义、固定事件领域、固定来源标签和热度标签。外部 Agent 在第一次接入时应先调用这个工具，避免把内部 ID、来源标签、事件领域混用。

### search_hot_events

查询热点事件列表。

支持参数：

- `query`：按事件标题或摘要搜索。
- `domains`：按事件领域过滤，例如 `AI`、`Prediction Markets`。
- `sources`：按来源标签过滤，例如 `X Trend`、`Topic Circle`、`Future Event`。
- `labels`：按热度或辅助标签过滤，例如 `Top5`、`Fast Rising`、`第一方确认`。
- `since`：只查询某个 ISO 时间之后更新的事件。
- `limit`：默认 20，最大 50。

### get_hot_event_detail

根据 `eventId` 查询热点详情，返回事件核心、证据链、时间线和 `promptContext`。外部 Agent 需要生成内容、分析承接角度或解释事件时，应优先使用这个工具。

### search_signals

查询进入热点系统的原始 Signal。

支持参数：

- `query`：按 Signal 标题或摘要搜索。
- `signalType`：按 Signal 类型过滤，例如 `x_trend`、`topic_watch_post`、`youtube_video`。
- `platform`：按平台过滤，例如 `x`、`youtube`。
- `since`：只查询某个 ISO 时间之后观测到的信号。
- `limit`：默认 20，最大 50。

## 调用示例

列出工具：

```bash
curl -X POST http://localhost:6061/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

查询最近热点：

```bash
curl -X POST http://localhost:6061/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_hot_events","arguments":{"limit":10}}}'
```

查询事件详情：

```bash
curl -X POST http://localhost:6061/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-with-mcp-api-key' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_hot_event_detail","arguments":{"eventId":"event_id_here"}}}'
```

## 返回原则

- 输出默认使用中文。
- 证据优先展示真实来源、账号、链接、发布时间、采集时间和公开指标。
- 不返回数据库连接信息、API Key、请求头、内部错误堆栈。
- 不把内部 ID 当成最终证据展示给用户；内部 ID 只用于继续调用详情工具。
