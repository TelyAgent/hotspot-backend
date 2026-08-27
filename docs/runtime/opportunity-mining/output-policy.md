# 输出策略

## 允许决策

- `create_opportunity`：形成新的运营机会。
- `create_event`：形成新的明确事件。
- `update_existing_opportunity`：更新已有机会。
- `create_insight`：只形成洞察，不进入事件。
- `ignore`：忽略。
- `request_human_review`：请求人工复核。

## 必填内容

最终输出必须包含：

- 中文标题。
- 中文摘要。
- 为什么现在值得做。
- 为什么重要。
- 产品承接角度。
- 内容窗口。
- 置信度。
- 证据引用。
- 缺失数据。
- 风险说明。

## 中文要求

- `title`、`summary`、`whyNow`、`whyItMatters`、`productAngles`、`contentWindow`、`missingData`、`riskNotes` 必须使用中文。
- 原始文本不是中文时，不要原样复制为主要结论，需要翻译或概括成中文。
- 专有名词可以保留原文，但解释必须是中文。

## 领域标签

领域只能使用以下固定值：

- `AI`
- `Technology`
- `Politics & Elections`
- `Geopolitics & Conflict`
- `Macro & Financial Markets`
- `Crypto & Web3`
- `Prediction Markets`
- `Official Schedule`

不要输出固定集合之外的领域。

## 禁止行为

- 不要输出 Markdown。
- 不要编造数据。
- 不要把平台热度直接当事实。
- 不要在证据不足时强行创建机会。
- 不要把多个不相关事件合并成一个机会。
