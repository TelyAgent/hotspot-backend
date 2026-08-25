# 未来事件来源策略

## 关注目标

关注会影响运营选题、内容预热和产品承接的未来事件。

优先关注：

- 美国宏观经济数据。
- 利率决议和央行会议。
- 就业、通胀、GDP、个人收入、贸易等经济发布时间。
- 重要节假日和可能影响运营排期的公共日程。
- 后续可扩展到 AI 产品发布、行业会议、预测市场和 Web3 监管事件。

## 已启用来源

- BEA 发布时间表
  - 用途：GDP、个人收入、贸易、企业利润等宏观经济数据。
  - 官方链接：https://www.bea.gov/news/schedule
  - 建议插件：`future-events`
  - 建议能力：`future.events.discover`
  - 建议参数：`{"sources":[{"sourceType":"bea","variables":{"url":"https://www.bea.gov/news/schedule"}}]}`
- BLS 发布日历
  - 用途：就业、CPI、PPI、JOLTS 等劳工与通胀数据。
  - 官方链接：https://www.bls.gov/schedule/news_release/bls.ics
  - 建议插件：`future-events`
  - 建议能力：`future.events.discover`
  - 建议参数：`{"sources":[{"sourceType":"bls","variables":{"url":"https://www.bls.gov/schedule/news_release/bls.ics","includeReleaseTypes":["Employment Situation","CPI","PPI","JOLTS","ECI"]}}]}`
  - 默认关注类型：Employment Situation、CPI、PPI、JOLTS、ECI。
- FOMC 会议日历
  - 用途：利率决议、议息会议和经济预测材料。
  - 官方链接：https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
  - 建议插件：`future-events`
  - 建议能力：`future.events.discover`
  - 建议参数：`{"sources":[{"sourceType":"fomc","variables":{"url":"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"}}]}`
- OPM 联邦假日
  - 用途：美国节假日排期。
  - 官方链接：https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
  - 建议插件：`future-events`
  - 建议能力：`future.events.discover`
  - 建议参数：`{"sources":[{"sourceType":"opm","variables":{"url":"https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/"}}]}`

## 抓取要求

- 优先官方来源。
- 只抓取当前日期之后的未来事件。
- 默认抓取当前自然年内的未来事件。
- 每条事件必须保留来源 URL、原始来源 ID 和证据引用。
- 如果来源无法访问或字段缺失，必须如实记录失败或缺失数据。

## 采集频率

- 官方日历默认每天检查一次。
- 如果来源变化频率较低，不要高频抓取。
- 如果后续发现事件临近，需要由未来事件监控计划单独提高监控频率。

## 当前没有工具但希望后续补充的来源

- 预测市场事件日历。
- AI 公司产品发布和活动页面。
- Web3 行业会议日历。
- 竞品公开活动和发布会页面。
