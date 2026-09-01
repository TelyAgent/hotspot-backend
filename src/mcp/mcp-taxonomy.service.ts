import { Injectable } from '@nestjs/common';

@Injectable()
export class McpTaxonomyService {
  getTaxonomy() {
    return {
      locale: 'zh-CN',
      entities: [
        {
          name: 'Signal',
          description:
            '不同来源进入热点系统前的统一信号。热搜词、主题圈帖子、YouTube 视频、未来事件和搜索结果都可以被标准化为 Signal。',
          importantFields: ['signalId', 'signalType', 'platform', 'sourceName', 'title', 'summary', 'url', 'publishedAt', 'observedAt', 'metrics'],
        },
        {
          name: 'Event',
          description:
            '热点挖掘 Agent 判断后形成的热点事件或运营机会，包含中文标题、事实摘要、领域、触发标签、证据引用和风险提示。',
          importantFields: ['eventId', 'title', 'summary', 'domains', 'sourceLabels', 'heatLabels', 'triggerReason', 'confidence', 'status'],
        },
        {
          name: 'Evidence',
          description:
            '支撑 Event 判断的可核验证据，优先包含真实来源链接、账号、发布时间、抓取时间和公开指标。',
          importantFields: ['evidenceId', 'source', 'sourceName', 'authorName', 'url', 'publishedAt', 'observedAt', 'metrics'],
        },
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
        { name: 'X Trend', description: '由 X 热搜榜信号触发或包含 X 热搜证据。' },
        { name: 'Topic Circle', description: '由重点主题追踪或圈层账号帖子触发。' },
        { name: 'Future Event', description: '由未来事件源或日程类信号触发。' },
        { name: 'Top5', description: '进入 X 输入榜单前 5 位或规则包中定义的高排名阈值。' },
        { name: 'Fast Rising', description: '相邻快照中排名快速上升。' },
        { name: 'Multi-region', description: '跨地区或多来源共同出现。' },
        { name: '第一方确认', description: '证据中包含 S1 第一方权威账号。' },
        { name: 'Re-entry', description: '曾出现过的事件重新进入观测范围。' },
      ],
      queryGuidance: [
        '需要找热点事件时优先调用 search_hot_events，再用 get_hot_event_detail 查看证据链。',
        '需要追溯原始输入时调用 search_signals。',
        '不要把内部 ID 当作用户可读证据；回答用户时优先使用来源名称、链接、发布时间和摘要。',
      ],
    };
  }
}
