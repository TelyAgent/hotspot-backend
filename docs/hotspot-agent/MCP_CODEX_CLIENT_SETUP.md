# Codex 接入 Hotspot MCP 配置文档

## 1. 目标

本文档说明如何在 Codex Desktop 中接入 Hotspot MCP，让 Codex 可以直接调用热点系统提供的工具查询：

- 系统事件领域、信号来源和标签语义
- 热点事件列表
- 单个热点事件详情
- 原始 Signal 数据

Hotspot MCP 是一个自定义 MCP Server，不是 Codex Plugin。它会出现在 Codex 的 MCP Servers 列表里，不一定会出现在 Plugins 列表里。

## 2. 前置条件

后端服务需要已经启动，并且 `/mcp` 接口可访问。

本地示例：

```text
http://192.168.120.135:3001/mcp
```

线上示例：

```text
http://34.94.189.76:6061/mcp
```

服务端必须配置：

```env
HOTSPOT_MCP_API_KEY=replace-with-real-mcp-api-key
```

注意：真实密钥不要提交到 GitHub，也不要写进公开文档。

## 3. 先用 curl 验证 MCP 服务

在配置 Codex 之前，先确认 MCP 服务本身能正常返回工具列表。

```bash
curl -X POST 'http://192.168.120.135:3001/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <HOTSPOT_MCP_API_KEY>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

正常情况下会返回：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_system_taxonomy"
      },
      {
        "name": "search_hot_events"
      },
      {
        "name": "get_hot_event_detail"
      },
      {
        "name": "search_signals"
      }
    ]
  }
}
```

如果这里失败，先不要排查 Codex，应该先处理后端地址、端口、鉴权或服务启动问题。

## 4. Codex 配置方式

编辑本机配置文件：

```text
~/.codex/config.toml
```

加入：

```toml
[mcp_servers.hotspot]
url = "http://192.168.120.135:3001/mcp"
bearer_token_env_var = "HOTSPOT_MCP_API_KEY"
enabled = true
tool_timeout_sec = 60
```

如果连接线上服务，可以改成：

```toml
[mcp_servers.hotspot]
url = "http://34.94.189.76:6061/mcp"
bearer_token_env_var = "HOTSPOT_MCP_API_KEY"
enabled = true
tool_timeout_sec = 60
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `mcp_servers.hotspot` | MCP Server 名称，Codex 内部会按这个名字注册服务 |
| `url` | Hotspot MCP 的 HTTP 地址 |
| `bearer_token_env_var` | Bearer Token 从哪个环境变量读取 |
| `enabled` | 是否启用该 MCP |
| `tool_timeout_sec` | 工具调用超时时间 |

## 5. 配置 Codex 可读取的密钥

Codex Desktop 是图形界面应用，直接在终端里 `export HOTSPOT_MCP_API_KEY=...` 不一定能被它读取。

推荐用 macOS 的 `launchctl` 设置：

```bash
launchctl setenv HOTSPOT_MCP_API_KEY "<HOTSPOT_MCP_API_KEY>"
```

设置完成后，需要完全退出 Codex Desktop，再重新打开。

可以用下面命令检查当前终端是否有这个变量：

```bash
if [ -n "$HOTSPOT_MCP_API_KEY" ]; then echo "HOTSPOT_MCP_API_KEY=set"; else echo "HOTSPOT_MCP_API_KEY=missing"; fi
```

不要在聊天窗口或公开文档里输出真实 key。

## 6. 重启与加载规则

配置修改后，需要执行：

1. 重启 Hotspot 后端服务。
2. 完全退出 Codex Desktop。
3. 重新打开 Codex Desktop。
4. 新建一个 Codex 任务测试。

老任务不一定会热更新 MCP 工具列表，所以建议用新任务验证。

## 7. 在 Codex 中测试

不要只问：

```text
你能看到哪些 MCP 工具？
```

这种问法可能只得到模型当前显式暴露的命名空间列表。

推荐直接要求调用工具：

```text
请调用 hotspot MCP 的 get_system_taxonomy 工具，告诉我系统支持哪些事件领域和信号来源。
```

也可以测试热点事件：

```text
请通过 hotspot MCP 查询最近 3 个热点事件。
```

如果接入正常，Codex 会调用类似下面的工具：

```text
mcp__hotspot__get_system_taxonomy
mcp__hotspot__search_hot_events
mcp__hotspot__get_hot_event_detail
mcp__hotspot__search_signals
```

## 8. 常见问题

### 8.1 MCP Servers 里能看到 hotspot，但任务里没有工具

常见原因：

- 当前任务创建早于 MCP 配置，工具列表没有热更新。
- Codex Desktop 没有读到 `HOTSPOT_MCP_API_KEY`。
- `/mcp` 的 `initialize` 或 `tools/list` 返回不符合客户端预期。
- MCP 地址在 Codex 进程里不可访问。

处理方式：

1. 用 curl 验证 `/mcp tools/list`。
2. 用 `launchctl setenv` 重新设置 key。
3. 完全退出并重启 Codex Desktop。
4. 新建任务再测。

### 8.2 Plugins 里看不到 hotspot

这是正常的。

Hotspot 是 MCP Server，不是 Codex Plugin。应该在 MCP Servers 列表或工具调用里确认。

### 8.3 curl 报 zsh: unknown file attribute

通常是把 Markdown 链接复制进了终端，例如：

```text
[http://192.168.120.135:3001/mcp](http://192.168.120.135:3001/mcp)
```

终端里必须使用纯 URL：

```bash
curl -X POST 'http://192.168.120.135:3001/mcp'
```

### 8.4 tools/list 能返回，但 Codex 不注册工具

优先检查服务端返回是否是标准 MCP 结构：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": []
  }
}
```

不要在 `tools/list` 的 `result` 里额外包非标准字段。

## 9. 推荐给外部使用方的描述

可以把 Hotspot MCP 描述为：

```text
Hotspot MCP 是热点情报系统的只读 MCP 服务。Agent 应优先调用 get_system_taxonomy 理解数据语义，再调用 search_hot_events、get_hot_event_detail 或 search_signals 查询热点事件、证据链和原始信号。
```

