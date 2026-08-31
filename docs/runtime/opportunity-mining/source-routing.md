# 来源路由规则

## 目的

告诉总 Agent 不同 Signal 类型进入挖掘时应优先参考哪些规则文档，以及哪些 Signal 值得优先处理。

## 路由表

```yaml
routes:
  x_trend:
    documents:
      - global-principles
      - source-routing
      - x-trend-rules
      - product-angle-rules
      - dedupe-and-evidence-rules
      - output-policy
    lookbackHours: 24
    batchLimit: 10
    priority: high
  x_post:
    documents:
      - global-principles
      - source-routing
      - topic-watch-rules
      - product-angle-rules
      - dedupe-and-evidence-rules
      - output-policy
    lookbackHours: 24
    batchLimit: 10
    priority: medium
  youtube_video:
    documents:
      - global-principles
      - source-routing
      - youtube-video-rules
      - product-angle-rules
      - dedupe-and-evidence-rules
      - output-policy
    lookbackHours: 168
    batchLimit: 10
    priority: medium
  future_event:
    documents:
      - global-principles
      - source-routing
      - future-event-rules
      - product-angle-rules
      - dedupe-and-evidence-rules
      - output-policy
    lookbackHours: 720
    batchLimit: 10
    priority: medium
  default:
    documents:
      - global-principles
      - source-routing
      - dedupe-and-evidence-rules
      - output-policy
    lookbackHours: 24
    batchLimit: 5
    priority: low
```

## 使用说明

- 路由表用于初始选择规则文档，不代表最终判断。
- 如果 Signal 类型未知，使用 default 路由。
- 如果规则文档需要更多证据，总 Agent 可以调用工具补充。
- 运营人员可以通过修改本文件调整哪些来源优先进入挖掘。
